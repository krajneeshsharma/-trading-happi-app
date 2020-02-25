const Joi = require('@hapi/joi');

const userDataServer = require('./userDataService');
const stockDataServer = require('./stockDataService');
const ServerResponse = require('../models/serverResponse');

if (typeof localStorage === 'undefined' || localStorage === null) {
  var LocalStorage = require('node-localstorage').LocalStorage;
  let rootFolder = process.env.APP_MOCKSERVER_DATA_FOLDER || '.';
  localStorage = new LocalStorage(rootFolder + '/.userdata');
}

let server = null;

const routes = [
  {
    method: 'GET',
    path: '/transactions',
    config: {
      description: 'Get user transactions',
      tags: ['api'],
      validate: {
        headers: {
          userid: Joi.string()
            .required()
            .description('userid')
        },
        options: {
          allowUnknown: true
        }
      }
    },
    handler: function (request, h) {
      return getTransactions(request.headers.userid);
    }
  },
  {
    method: 'GET',
    path: '/drafts',
    config: {
      description: 'Get user drafts',
      tags: ['api'],
      validate: {
        headers: {
          userid: Joi.string()
            .required()
            .description('userid')
        },
        options: {
          allowUnknown: true
        }
      }
    },
    handler: function (request, h) {
      return getDrafts(request.headers.userid);
    }
  },
  {
    method: 'DELETE',
    path: '/drafts',
    config: {
      description: 'delete user drafts',
      tags: ['api'],
      validate: {
        headers: {
          userid: Joi.string()
            .required()
            .description('userid')
        },
        options: {
          allowUnknown: true
        }
      }
    },
    handler: function (request, h) {
      return deleteDrafts(request.headers.userid);
    }
  },
  {
    method: 'POST',
    path: '/transactions',
    config: {
      description: 'Execute a transaction',
      tags: ['api'],
      validate: {
        headers: {
          userid: Joi.string()
            .required()
            .description('userid')
        },
        payload: Joi.object({
          symbol: Joi.string()
            .required()
            .description('symbol'),
          side: Joi.string()
            .valid(['BUY', 'SELL', 'DRAFT'])
            .required()
            .description('BUY , SELL or DRAFT'),
          amount: Joi.number()
            .required()
            .description('amount')
        }).label('Order'),
        options: {
          allowUnknown: true
        }
      }
    },
    handler: function (request, h) {
      let order = request.payload;
      result = executeOrder(request.headers.userid, order);
      console.log(result, "res");
      if (typeof result !== 'string') {
        return Object.assign({}, { transaction: result }, userDataServer.getUserData(request.headers.userid));
      } else {
        return h.response(new ServerResponse(false, result)).code(400);
      }
    }
  }
];

function executeOrder(userId, order) {
  let stockInfo = stockDataServer.getStockInfo(order.symbol);
  if (!stockInfo) {
    return `Stock symbol ${order.symbol} not supported.`;
  }

  if (!stockInfo.lastTick) {
    return `Stock ${order.symbol} is not priced yet.`;
  }

  if (order.amount <= 0) {
    return `Amout is less than zero.`;
  }

  let userData = userDataServer.getUserData(userId);

  let currentAllocation = userData.allocations.find((allocation) => {
    return allocation.symbol == order.symbol;
  });

  let transaction = {
    side: order.side,
    symbol: order.symbol,
    amount: order.amount,
    tickPrice: stockInfo.lastTick.price,
    cost: order.amount * stockInfo.lastTick.price,
    date: new Date()
  };

  if (transaction.side === 'BUY') {
    if (currentAllocation) {
      currentAllocation.amount += order.amount;
    } else {
      userData.allocations.push({
        symbol: order.symbol,
        amount: order.amount
      });
    }
    userData.liquidity -= transaction.cost;
  } else if (transaction.side === 'DRAFT') {
    console.log("in daraft 111");
  } else {
    if (!currentAllocation) {
      return `Stock ${order.symbol} allocation not found. Can't sell.`;
    } else {
      if (currentAllocation.amount < order.amount) {
        return (
          `Current allocation for stock ${order.symbol}:${currentAllocation.amount}` +
          ` is less than requested sell amount:${transaction.amount}.`
        );
      } else {
        currentAllocation.amount -= order.amount;
      }
    }

    userData.liquidity += transaction.cost;
  }
  if (transaction.side === 'DRAFT') {
    saveDrafts(userId, transaction);
    return transaction;
  } else {
    saveTransaction(userId, transaction);
    userDataServer.saveUserData(userId, userData);
    return transaction;
  }
}

function saveDrafts(userId, transaction) {
  let drafts = getDrafts(userId);
  drafts.push(transaction);
  localStorage.setItem('userDrafts_' + userId, JSON.stringify(drafts));
}

function getDrafts(userId) {
  let data = localStorage.getItem('userDrafts_' + userId);
  return data ? JSON.parse(data) : [];
}
function deleteDrafts(userId) {
  localStorage.removeItem('userDrafts_' + userId);
  return true;
}


function saveTransaction(userId, transaction) {
  let transactions = getTransactions(userId);
  transactions.push(transaction);
  localStorage.setItem('userTransactions_' + userId, JSON.stringify(transactions));
}

function getTransactions(userId) {
  let data = localStorage.getItem('userTransactions_' + userId);
  return data ? JSON.parse(data) : [];
}

function initRoutes() {
  routes.forEach(function (route) {
    server.route(route);
  });
}

exports.init = function (serverRef) {
  server = serverRef;
  initRoutes();
};
