/**
 * Check da redação de payload (lib/log-redact.ts). Roda com:
 *   npx tsx scripts/check-log-redact.ts
 * Falha = PII passando em claro para zapi_eventos_descartados.
 */
import assert from "node:assert/strict";
import { redigirEstrutura } from "../src/lib/log-redact";

const entrada = {
    type: "EditedMessageCallback",
    messageId: "3EB0ABC",
    editedMessageId: "3EB0DEF",
    phone: "5511986764131",
    chatLid: "123456789012345@lid",
    participantPhone: "5511999998888",
    fromMe: true,
    fromApi: true,
    momment: 1758000000000,
    chatName: "Escola Tal",
    senderPhoto: "https://pps.whatsapp.net/v/t61.24694-24/foto.jpg?oh=abc&oe=def",
    text: { message: "conteúdo sigiloso da mensagem" },
    image: { imageUrl: "https://mmg.whatsapp.net/d/f/x.enc?ccb=1", caption: "legenda", mimeType: "image/jpeg" },
    location: { latitude: -23.55, longitude: -46.63, address: "Rua X, 123" },
    reaction: { value: "👍", referencedMessage: { messageId: "3EB0AAA", phone: "5511986764131" } },
    lista: ["texto", 42, null],
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- check navega o objeto redigido livremente
const saida = redigirEstrutura(entrada) as any;
const json = JSON.stringify(saida);

// Nada de PII em claro.
for (const proibido of ["5511986764131", "986764131", "5511999998888", "sigiloso", "Escola Tal", "Rua X", "oh=abc", "ccb=1", "123456789012345", "-23.55"]) {
    assert.ok(!json.includes(proibido), `vazou: ${proibido}`);
}
// Estrutura preservada e legível.
assert.equal(saida.type, "EditedMessageCallback");
assert.equal(saida.messageId, "3EB0ABC");
assert.equal(saida.editedMessageId, "3EB0DEF");
assert.equal(saida.phone, "***4131");
assert.equal(saida.chatLid, "***2345");
assert.equal(saida.reaction.referencedMessage.phone, "***4131");
assert.equal(saida.text.message, "<29 chars>");
assert.equal(saida.image.imageUrl, "<url mmg.whatsapp.net>");
assert.equal(saida.image.mimeType, "image/jpeg");
assert.equal(saida.senderPhoto, "<url pps.whatsapp.net>");
assert.equal(saida.location.latitude, "<num>");
assert.equal(saida.fromApi, true);
assert.equal(saida.momment, 1758000000000);
assert.deepEqual(saida.lista, ["<5 chars>", 42, null]);
// Sem redação, a mesma string teria vazado — prova de que o check morde.
assert.ok(JSON.stringify(entrada).includes("sigiloso"));
console.log("ok — redação de estrutura");
