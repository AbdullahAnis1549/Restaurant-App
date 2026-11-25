// Support the original project variable names while canonical STRIPE_* names take priority.
export function stripeConfiguration(env = process.env) {
 return { secretKey: env.STRIPE_SECRET_KEY || env.SecretKey || '', publishableKey: env.STRIPE_PUBLISHABLE_KEY || env.PublishableKey || '', mode: env.STRIPE_MODE || 'test' };
}
