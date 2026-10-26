export const calls = [];
let handler = () => { throw new Error('Unexpected API call'); };
export function mockApi(next) { calls.length = 0; handler = next; }
export default Object.fromEntries(['get', 'post', 'patch', 'delete'].map((method) => [method, async (...args) => {
  calls.push({ method, args });
  return handler(method, ...args);
}]));
