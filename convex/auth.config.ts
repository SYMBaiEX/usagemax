const clientId = process.env.WORKOS_CLIENT_ID;
const connectClientId = process.env.WORKOS_CONNECT_CLIENT_ID || clientId;
const authkitDomain = (process.env.WORKOS_AUTHKIT_DOMAIN || "https://wholesome-car-48.authkit.app").replace(/\/$/, "");

const authConfig = {
  providers: [
    {
      type: "customJwt" as const,
      issuer: "https://api.workos.com/",
      algorithm: "RS256" as const,
      jwks: `https://api.workos.com/sso/jwks/${clientId}`,
      applicationID: clientId,
    },
    {
      type: "customJwt" as const,
      issuer: `https://api.workos.com/user_management/${clientId}`,
      algorithm: "RS256" as const,
      jwks: `https://api.workos.com/sso/jwks/${clientId}`,
    },
    {
      // WorkOS Connect delegated access tokens are JWTs issued by the AuthKit
      // environment, not by the website's user-management issuer. Keeping a
      // separate provider lets Convex verify standard OAuth user grants while
      // preserving the existing AuthKit session providers above.
      type: "customJwt" as const,
      issuer: authkitDomain,
      algorithm: "RS256" as const,
      jwks: `${authkitDomain}/oauth2/jwks`,
      ...(connectClientId ? { applicationID: connectClientId } : {}),
    },
  ],
};

export default authConfig;
