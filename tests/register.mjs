import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Use the installed TypeScript compiler with Node's test runner; no new dependency.
registerHooks({
  resolve(specifier, context, next) {
    if (/\/lib\/apiClient(?:\.ts)?$/.test(specifier)) return { url: new URL('./mockApiClient.mjs', import.meta.url).href, shortCircuit: true };
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      for (const extension of ['.ts', '.tsx']) {
        try { return next(`${specifier}${extension}`, context); } catch { /* Try the next source extension. */ }
      }
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('.ts') || url.endsWith('.tsx')) return {
      format: 'module', shortCircuit: true,
      source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
      }).outputText,
    };
    return next(url, context);
  },
});
