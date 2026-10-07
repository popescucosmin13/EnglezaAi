# Security

Use your own development services. Provider credentials and Firebase Admin keys belong only in server environment variables. Client Firebase configuration and RevenueCat SDK keys do not replace server authorization or Firestore rules.

Do not commit real environment files, tokens, service accounts, signing material, learner exports or review-account credentials. Use synthetic data for tests and screenshots. The checked-in configuration contains placeholders and demonstrative identifiers.

Review access rules, admin roles, email-verification policy, subscription enforcement and distributed quotas before deploying. Enable only the permissions your instance needs. Public source availability is not a security audit of the live application.

If a credential is exposed, revoke or rotate it with the provider. Deleting a file or creating a new repository cannot recall previous public copies. Report security issues privately through the support contact on [the application website](https://englezaai.com), without posting credentials or customer data.
