---
description: Subir alterações para o GitHub automaticamente após cada tarefa aceita
---

# Auto Push para GitHub

Após cada alteração aceita pelo usuário, execute os seguintes passos para subir para o GitHub:

// turbo-all

1. Stage todas as alterações:
```bash
git add -A
```

2. Crie um commit com uma mensagem descritiva no formato conventional commits:
```bash
git commit -m "<type>: <descrição curta em português>"
```

Tipos comuns:
- `feat:` para novas funcionalidades
- `fix:` para correções de bugs
- `refactor:` para refatorações
- `chore:` para manutenção, dependências, etc.
- `style:` para alterações visuais/CSS

3. Faça o push para o branch main:
```bash
git push origin main
```
