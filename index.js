const blessed = require('blessed')
const contrib = require('blessed-contrib')
const api = require('./libs/api')
const utils = require('./libs/utils')
const wash = require('./libs/wash')

class Whale {
  constructor(config, exchange, markets) {
    this.config        = config;
    this.exchange      = exchange;
    this.markets       = markets;
    this.currentMarket = markets[0];
    this.currentPeriod = exchange.periods[0];
    this.data = {};

    this.fetchAll().then((data) => {
      this.data = data;
      this.lastUpdate = new Date();

      this.initScreen();
      this.initDashBoard();
      this.eventListeners();
    }).catch(this.errorHandler.bind(this, 'fetchPrice'));
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
      title: `Whale -- ${this.exchange.name}`
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
      , padding: { top: this.config.tableHeaders ? 0 : -1 }
      , columnWidth: [10, 10, 10] });

    this.table.rows.on('select', (item, idx) => {
      this.currentMarket = this.data.currentPrice[idx].name;
      this.updatePriceTrend();
    })

    this.line = this.grid.set(4, 0, 8, 12, contrib.line,
      { style: {
          baseline: this.config.colors.chartBaseline
        , text: this.config.colors.chartText }
      , showLegend: this.config.showLegend });

    this.log = this.grid.set(11, 6, 1, 6, contrib.log,
      { fg: this.config.colors.logFg
      , selectedFg: this.config.colors.logSelectedFg
      , label: { text: ' Log ', side: 'right' }});
    this.log.setBack();

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
      this.timer && clearInterval(this.timer)
      return process.exit(0)
    });

    this.screen.key(['?'], (ch, key) => {
      this.toggleHelp();
    });
  }

  drawHelp() {
    console.log(this.exchange);
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
    this.table.setData({
      headers: this.config.tableHeaders ? ['Market', 'Price', 'Change'] : [],
      data: wash.currentPrice(this.exchange, this.data.currentPrice)
    });

    const lastUpdate = utils.formatCurrentTime(this.lastUpdate);
    this.table.setLabel(` ${this.exchange.name} -- Current Price -- (${lastUpdate}) `);
    this.table.focus();
    this.screen.render();
  }

  updateLine() {
    const data   = this.data.priceTrend;
    const series = { title: data.currentMarket
                   , x: data.labels
                   , y: data.closePricesList
                   , style: { line: this.config.colors.chartLine }}

    this.line.setData(series);
    this.line.setLabel(` ${data.currentMarket} -- Price Trend `)
    this.screen.render();
  }

  updateCurrentPrice() {
    this.createLog(`Fetching current prices...`);
    api.getCurrentPrice(this.exchange, this.markets).then((res) => {
      this.data.currentPrice = res;
      this.lastUpdate = new Date();
      this.updateTable();
      this.hideLog();
    }).catch(this.errorHandler.bind(this));
  }

  updatePriceTrend() {
    this.createLog(`Fetching ${this.currentMarket} price trend...`)
    api.getPriceTrend(this.exchange, this.currentMarket, null, this.currentPeriod).then((data) => {
      this.data.priceTrend = data;
      this.updateLine();
      this.hideLog();
    }).catch(this.errorHandler.bind(this));
  }

  createLog(data) {
    this.log.setFront();
    this.log.log(data);
    this.screen.render();
  }

  hideLog() {
    this.log.setBack();
    this.screen.render();
  }

  toggleHelp() {
    this.help.visible ? this.help.hide() : this.help.show();
    this.screen.render();
  }

  errorHandler(from, err) {
    console.error(`[FATAL][${from || '?'}]`, err);
    process.exit(1);
  }
}

module.exports = Whale
