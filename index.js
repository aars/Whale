const blessed = require('blessed')
const contrib = require('blessed-contrib')
const api = require('./libs/api')
const utils = require('./libs/utils')
const wash = require('./libs/wash')

const icons = {
  whale: '🐳'
};

class Whale {
  constructor(config, exchange, markets) {
    this.config        = config;
    this.exchange      = exchange;
    this.markets       = markets;
    this.currentMarket = markets[0];
    this.currentPeriod = exchange.defaultPeriod || exchange.periods[0];
    this.data = {};

    this.running = false;
    this.initScreen();
    this.initDashBoard();
    this.eventListeners();

    this.init();
  }

  init() {
    this.logMsg('Fetching initial data...');
    this.fetchAll().then((data) => {
      this.running = true;
      this.data = data;
      this.lastUpdate = new Date();
      this.hideLog();
      this.updateTable();
      this.updateLine();
    }).catch((err) => {
      this.hideLog();
      this.errorHandler(err, this.init.bind(this));
    });
  }

  fetchAll() {
    return new Promise((resolve, reject) => {
      Promise.all([
        api.getCurrentPrice(this.exchange, this.markets),
        api.getPriceTrend(this.exchange, this.currentMarket, null, this.currentPeriod)
      ]).then((res) => {
        resolve({
          currentPrice: res[0],
          priceTrend: res[1]
        })
      }).catch(reject);
    })
  }

  initScreen() {
    this.screen = blessed.screen({
      smartCSR: true,
      forceUnicode: true,
      fullUnicode: true,
      title: `${icons.whale} ${this.exchange.name}`
    });
    this.grid = new contrib.grid({
      screen: this.screen,
      rows: 12,
      cols: 12,
      color: this.config.colors.border
    });
  }

  initDashBoard() {
    this.table = this.grid.set(0, 0, 4, 12, contrib.table,
      { keys: true
      , vi: true
      , fg: this.config.colors.tableFg
      , selectedFg: this.config.colors.tableSelectedFg
      , selectedBg: this.config.colors.tableSelectedBg
      , interactive: true
      , columnSpacing: 10
      , label: ` ${icons.whale}  ${this.exchange.name} -- Current Price -- (No Data) `
      , padding: { top: this.config.tableHeaders ? 0 : -1 }
      , columnWidth: [10, 10, 10] });

    this.table.rows.on('select', (item, idx) => {
      if (!this.running) return;

      this.currentMarket = this.data.currentPrice[idx].name;
      this.updatePriceTrend();
    })

    this.line = this.grid.set(4, 0, 8, 12, contrib.line,
      { style: {
          baseline: this.config.colors.chartBaseline
        , text: this.config.colors.chartText }
      , label: ` ${this.currentMarket} -- Price Trend -- (No Data) `
      , showLegend: this.config.showLegend });

    this.log = blessed.box({
      top: '80%',
      left: '50%',
      width: '50%',
      height: '20%',
      border: { type: 'line' },
      style: { fg: this.config.colors.logFg, border: { fg: this.config.colors.logBorder } },
      padding: { left: 2, top: 1, bottom: 1, right: 2 },
      label: ' Log ',
    });
    this.log.hide();
    this.screen.append(this.log);

    this.error = blessed.box({
      top: 'center',
      left: 'center',
      width: '50%',
      height: '50%',
      align: 'center',
      valign: 'middle',
      border: { type: 'line' },
      style: { fg: 'red', border: { fg: 'red' } },
      padding: { left: 2, top: 1, bottom: 1, right: 2 },
      label: ' Error -- Press Enter to close ',
    });
    this.error.hide();
    this.screen.append(this.error);

    this.help = blessed.box({
      top: 'center',
      left: 'center',
      width: '80%',
      height: '50%',
      border: { type: 'line' },
      style: { border: { fg: this.config.colors.border } },
      padding: { left: 2, top: 1, bottom: 1, right: 2 },
      label: ' Help ',
    });
    this.help.hide();
    this.screen.append(this.help);
    this.drawHelp();

    this.updateTable();
    this.updateLine();

    this.screen.render();
  }

  eventListeners() {
    const priceInterval = this.config.priceInterval * 1000;
    const trendInterval = this.config.trendInterval * 1000;
    this.timers = {
      price: setInterval(this.updateCurrentPrice.bind(this), priceInterval),
      trend: setInterval(this.updatePriceTrend.bind(this), trendInterval)
    };

    this.screen.on('resize', () => {
      utils.throttle(this.initDashBoard.bind(this), 360)();
    });

    this.screen.key(['escape', 'q', 'C-c'], (ch, key) => {
      if (this.help.visible) return this.toggleHelp();
      this.timer && clearInterval(this.timer)
      return process.exit(0)
    });

    // priceTrend period keys
    const periods = this.exchange.periods;
    const periodKeys = Array(periods.length).fill(1).map((v, idx) => { return idx+1 });
    this.screen.key(periodKeys, (ch, key) => {
      this.currentPeriod = periods[ch-1];
      this.updatePriceTrend();
    });

    this.screen.key(['?'], this.help.show.bind(this.help));
  }

  drawHelp() {
    // Periods
    let str = "PriceTrend interval: [key] interval\r\n";
    let key = 1;
    this.exchange.periods.forEach(p => {
      str += `[${key}] ${p} `
      key++;
    });
    this.help.setContent(str);
  }

  updateTable() {
    if (!this.running) return;

    this.table.setData({
      headers: this.config.tableHeaders ? ['Market', 'Price', 'Change'] : [],
      data: wash.currentPrice(this.exchange, this.data.currentPrice)
    });

    const lastUpdate = utils.formatCurrentTime(this.lastUpdate);
    this.table.setLabel(` ${icons.whale}  ${this.exchange.name} -- Current Price -- (${lastUpdate}) `);
    this.table.focus();
    this.screen.render();
  }

  updateLine() {
    if (!this.running) return;

    const data   = this.data.priceTrend;
    const series = { title: data.currentMarket
                   , x: data.labels
                   , y: data.closePricesList
                   , style: { line: this.config.colors.chartLine }}

    this.line.setData(series);
    this.line.setLabel(` ${data.currentMarket} -- Price Trend -- ${utils.formatPeriod(this.currentPeriod)} `)
    this.screen.render();
  }

  updateCurrentPrice() {
    if (!this.running) return;

    this.logMsg(`Fetching current prices...`);
    api.getCurrentPrice(this.exchange, this.markets).then((res) => {
      this.data.currentPrice = res;
      this.lastUpdate = new Date();
      this.updateTable();
      this.hideLog();
    }).catch(this.errorHandler.bind(this));
  }

  updatePriceTrend() {
    if (!this.running) return;

    this.logMsg(`Fetching ${this.currentMarket} price trend... (i:${utils.formatPeriod(this.currentPeriod)})`);
    api.getPriceTrend(this.exchange, this.currentMarket, null, this.currentPeriod).then((data) => {
      this.data.priceTrend = data;
      this.updateLine();
      this.hideLog();
    }).catch(this.errorHandler.bind(this));
  }

  logMsg(msg) {
    this.log.style.fg = this.config.colors.logFg;
    this.log.style.border.fg = this.config.logBorder;

    this.log.show();
    this.log.setContent(msg);
    this.screen.render();
  }

  logError(msg, cb) {
    this.error.show();
    this.error.setContent(msg);
    this.error.focus();

    this.screen.onceKey(['enter'], (ch, key) => {
      this.error.hide();
      this.table.focus();
      this.screen.render();
      if(cb) cb();
    });

    this.screen.render();
  }

  hideLog() {
    this.log.hide();
    this.log.logLines = [];
    this.screen.render();
  }

  toggleHelp() {
    this.help.visible ? this.help.hide() : this.help.show();
    this.screen.render();
  }

  errorHandler(err, cb) {
    cb = typeof cb === 'function' ? cb : null;
    if (err.response && err.response.request) {
      this.logError(`HTTP Error ${err.status}`, cb);
      return;
    }

    console.error('[FATAL]', err, cb);
    process.exit(1);
  }
}

module.exports = Whale
