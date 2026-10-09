import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyZapiWebhook } from "./webhook-auth";
import { redigirEstrutura } from "./log-redact";

process.env.ZAPI_TOKEN = "token-da-instancia-123456";
process.env.ZAPI_INSTANCE = "ID-DA-INSTANCIA-PUBLICO";
process.env.ZAPI_CLIENT_TOKEN = "client-token-da-conta-9876";

const req = (headers: Record<string, string>) =>
    new Request("https://crm.test/api/webhooks/zapi", { method: "POST", headers });

test("aceita o token da instância nos dois nomes de header", () => {
    assert.equal(verifyZapiWebhook(req({ "z-api-token": "token-da-instancia-123456" })).ok, true);
    assert.equal(verifyZapiWebhook(req({ "client-token": "token-da-instancia-123456" })).ok, true);
});

test("recusa o ID da instância, que vem em todo payload", () => {
    const r = verifyZapiWebhook(req({ "z-api-token": "ID-DA-INSTANCIA-PUBLICO" }));
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.status, 401);
});

test("recusa o Client-Token da conta, que a Z-API não usa no webhook", () => {
    assert.equal(verifyZapiWebhook(req({ "z-api-token": "client-token-da-conta-9876" })).ok, false);
});

test("recusa chamada sem header ou com valor errado", () => {
    assert.equal(verifyZapiWebhook(req({})).ok, false);
    assert.equal(verifyZapiWebhook(req({ "z-api-token": "qualquer-coisa" })).ok, false);
});

test("sem ZAPI_TOKEN configurado, recusa tudo com 500", () => {
    const salvo = process.env.ZAPI_TOKEN;
    delete process.env.ZAPI_TOKEN;
    const r = verifyZapiWebhook(req({ "z-api-token": "token-da-instancia-123456" }));
    process.env.ZAPI_TOKEN = salvo;
    assert.equal(!r.ok && r.status, 500);
});

test("log-redact não grava instanceId nem tokens em claro", () => {
    const saida = redigirEstrutura({
        instanceId: "ID-DA-INSTANCIA-PUBLICO",
        messageId: "3EB0ABC",
        token: "abc",
        phone: "5511999998888",
    }) as Record<string, string>;
    assert.equal(saida.instanceId, "<redigido>");
    assert.equal(saida.token, "<redigido>");
    assert.equal(saida.messageId, "3EB0ABC");
    assert.equal(saida.phone, "***8888");
});
