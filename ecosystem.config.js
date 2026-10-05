/**
 * PM2 Production Configuration (PRD section 59: Phase 17).
 *
 * Usage:
 *   pm2 start ecosystem.config.js --env production
 *   pm2 save
 *   pm2 startup
 */
module.exports = {
  apps: [
    {
      name: 'personal-cash-flow',
      script: 'server/server.js',
      cwd: './',
      instances: 'max',
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,
        COOKIE_SECURE: 'true',
      },
    },
  ],
};
