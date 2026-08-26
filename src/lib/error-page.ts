import appCss from "../styles.css?url";

export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>This page didn't load</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="${appCss}" />
    <style>
      body { font: var(--font-weight-normal) var(--text-base)/1.55 var(--font-sans); background: var(--color-surface-alt); color: var(--color-text-primary); display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 28rem; width: 100%; text-align: center; padding: 2rem; }
      h1 { font-size: var(--text-lg); font-weight: var(--font-weight-bold); margin: 0 0 0.5rem; }
      p { color: var(--color-text-secondary); margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.5rem 1rem; border-radius: var(--radius-md); font: inherit; font-weight: var(--font-weight-medium); cursor: pointer; text-decoration: none; border: 0.0625rem solid transparent; }
      a:focus-visible, button:focus-visible { outline: 0.125rem solid var(--color-action); outline-offset: 0.125rem; }
      .primary { background: var(--color-action); color: var(--color-surface); }
      .primary:hover { background: var(--color-action-hover); }
      .primary:active { background: var(--color-action-pressed); }
      .secondary { background: var(--color-surface); color: var(--color-action-deep); border-color: var(--color-border); }
      .secondary:hover { background: var(--color-action-subtle); }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>This page didn't load</h1>
      <p>Something went wrong on our end. You can try refreshing or head back home.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Try again</button>
        <a class="secondary" href="/">Go home</a>
      </div>
    </div>
  </body>
</html>`;
}
