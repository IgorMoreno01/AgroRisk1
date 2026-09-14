---
name: Watcher Vite e caches
description: Evita travamento do Preview por crescimento massivo de descritores no watcher do Vite.
---

O watcher do Vite deve ignorar `.cache`, metadados locais e diretórios de build, mantendo `src` e `public` observados normalmente.

**Why:** observar `.cache` abriu cerca de 71 mil descritores; o servidor aceitava conexões, mas não enviava bytes, enquanto o build compilado respondia normalmente.

**How to apply:** ao ajustar a configuração do dev server, preserve as exclusões do watcher e valide descritores antes/depois de recargas e builds.