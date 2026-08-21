/**
 * Logger utility – structured logging with timestamps and levels.
 * Backed by winston; writes to console and optionally to a log file.
 */

'use strict';

const { createLogger, format, transports } = require('winston');
const path = require('path');

let _logger = null;

/**
 * Build (or return cached) logger instance.
 * @param {object} cfg  logging section from config.json
 * @returns {import('winston').Logger}
 */
function getLogger(cfg = {}) {
  if (_logger) return _logger;

  const level = cfg.level || 'info';
  const logFile = cfg.file || 'output/job-search.log';

  const logFormat = format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.printf(({ timestamp, level: lvl, message }) => {
      return `[${timestamp}] [${lvl.toUpperCase().padEnd(5)}] ${message}`;
    })
  );

  const transportList = [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        logFormat
      ),
    }),
    new transports.File({
      filename: logFile,
      format: logFormat,
    }),
  ];

  _logger = createLogger({
    level,
    transports: transportList,
  });

  return _logger;
}

module.exports = { getLogger };
