---
name: Carregamento de fontes web
description: Compatibilidade de fontes remotas com o pipeline CSS atual.
---

Carregue webfonts remotas com declarações `@font-face` apontando diretamente para os arquivos da fonte; não use `@import` do Google Fonts.

**Why:** O pipeline Vite/Lightning CSS interpreta o URL do `@import` remoto como caminho de arquivo e interrompe o build com `ENOENT`.

**How to apply:** Ao adicionar ou atualizar fontes web no tema global, obtenha os URLs oficiais e mantenha os pesos explicitamente declarados em `@font-face`.