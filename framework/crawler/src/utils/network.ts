export function extractURLParams(url: string): URLSearchParams {
  return new URL(url).searchParams;
}