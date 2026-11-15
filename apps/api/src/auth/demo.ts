/** The shared Demo account (GLOSSARY): anyone can use it, so its password can never be reset. */
export const DEMO_EMAIL = 'demo@tripwise.app';

export const isDemoAccount = (email: string) => email.trim().toLowerCase() === DEMO_EMAIL;
