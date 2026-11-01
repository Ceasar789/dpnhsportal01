if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL && !process.env.VERCEL_ENV) {
  process.env.NODE_ENV = 'development';
}
