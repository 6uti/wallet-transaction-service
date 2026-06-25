import { utilities as nestWinstonModuleUtilities } from 'nest-winston';
import * as winston from 'winston';

export const winstonConfig: winston.LoggerOptions = {
  level: process.env.LOG_LEVEL ?? 'info',
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: false }), // Never log stack traces
        nestWinstonModuleUtilities.format.nestLike('WalletService', {
          prettyPrint: process.env.NODE_ENV !== 'production',
          colors: process.env.NODE_ENV !== 'production',
        }),
      ),
    }),
  ],
};
