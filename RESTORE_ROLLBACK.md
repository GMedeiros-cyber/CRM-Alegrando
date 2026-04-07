# Ponto de Restauracao - Proxy Z-API (2026-04-07)

## Como reverter tudo caso algo de errado

### 1. Codigo (Git)
```bash
git checkout main -- src/app/api/webhooks/zapi/
# Ou para remover completamente:
git clean -fd src/app/api/webhooks/zapi/
```
O commit de restauracao e o `c8dda21` (ultimo commit limpo antes das alteracoes).

### 2. Banco de Dados (Supabase SQL Editor)
```sql
-- Remover o indice
DROP INDEX IF EXISTS idx_messages_metadata;

-- Remover a coluna metadata
ALTER TABLE messages DROP COLUMN IF EXISTS metadata;
```

### 3. n8n - Workflow "Agente de IA - Alegrando" (id: r9PfWkZ5lH8xdJYP)
O backup completo do workflow esta em: `RESTORE_n8n_workflow_backup.json`
Para restaurar: importar o JSON via n8n UI ou usar a API/MCP para update_full_workflow.

Alteracao feita: desconectamos o no "novo" da saida TRUE do "If6" (fromMe=true).
Para reverter manualmente: reconectar If6 output[0] -> "novo" node.

### 4. Z-API
- Trocar a URL "Ao receber" DE volta para: `https://n8n.alegrando.cloud/webhook/zapi`
- Desativar o toggle "Notificar as enviadas por mim tambem" (se quiser voltar ao estado original)

### 5. Variavel de ambiente
- Remover `N8N_ZAPI_WEBHOOK_URL` do `.env.local` e do painel Vercel
