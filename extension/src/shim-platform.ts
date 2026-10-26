// Extension build of ../src/platform: plain fetch (host_permissions make provider APIs CORS-free in the service worker).
export const isDesktop = false;
export const pfetch = (input: string, init?: RequestInit) => fetch(input, init);
