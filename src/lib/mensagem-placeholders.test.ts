import { test } from "node:test";
import assert from "node:assert/strict";
import {
    catalogoDaMensagem,
    inserirNoCursor,
    LINK_GOOGLE_PADRAO,
    partesDaMensagem,
    previaDaMensagem,
    validarMensagem,
    validarSetting,
} from "./mensagem-placeholders";

const CAT = catalogoDaMensagem("aniversario_mensagem");

test("catálogo do aniversário: só {nome}, com exemplo", () => {
    assert.deepEqual(CAT.map((p) => p.chave), ["nome"]);
    assert.equal(CAT[0].exemplo, "Maria Fernanda Souza");
});

test("catálogo de cada mensagem = o que o envio dela preenche", () => {
    const chaves = (c: Parameters<typeof catalogoDaMensagem>[0]) => catalogoDaMensagem(c).map((p) => p.chave);
    // cron e sendManualFollowup passam { nome, link_google } aos dois textos
    assert.deepEqual(chaves("followup_mensagem"), ["nome", "link_google"]);
    assert.deepEqual(chaves("avaliacao_mensagem"), ["nome", "link_google"]);
    // sendPosPasseio passa { nome, link } — o link colado no painel
    assert.deepEqual(chaves("pos_passeio_mensagem"), ["nome", "link"]);
});

test("exemplo do {link_google} é o link de verdade que o envio usa", () => {
    const ex = (link?: string) => catalogoDaMensagem("avaliacao_mensagem", link).find((p) => p.chave === "link_google")?.exemplo;
    assert.equal(ex(), LINK_GOOGLE_PADRAO);
    assert.equal(ex("https://g.page/r/xyz/review"), "https://g.page/r/xyz/review");
});

test("servidor: texto vazio é recusado em qualquer mensagem", () => {
    assert.equal(validarSetting("followup_mensagem", "  "), "Escreva a mensagem antes de salvar.");
});

test("servidor: placeholder fora do catálogo DAQUELA chave é recusado", () => {
    assert.equal(validarSetting("aniversario_mensagem", "Oi {link_google}"), "Não reconheço {link_google}. Use {nome}.");
    assert.equal(validarSetting("avaliacao_mensagem", "Oi {link_google}"), null);
    assert.equal(validarSetting("pos_passeio_mensagem", "Oi {nmoe} {link}"), "Não reconheço {nmoe}. Use {nome}, {link}.");
});

test("servidor: {{x}} vale como {x} — os textos salvos misturam as duas formas", () => {
    assert.equal(validarSetting("followup_mensagem", "Olá {{nome}}! {{link_google}}"), null);
});

test("servidor: os textos guardados hoje passam, menos a URL entre chaves do pós-passeio", () => {
    assert.equal(validarSetting("avaliacao_mensagem", "Olá {{nome}}! 😊\n\n{{link_google}}"), null);
    // Medido em 19/10/2026: o pós-passeio salvo termina com "{https://forms.gle/...}".
    // O envio manda as chaves literais ao cliente; a tela tem de apontar isso.
    assert.equal(
        validarSetting("pos_passeio_mensagem", "Olá {nome}! o link está aqui: {https://forms.gle/EXEMPLO}"),
        "Não reconheço {https://forms.gle/EXEMPLO}. Use {nome}, {link}.",
    );
});

test("servidor: chave que não é mensagem não é validada aqui", () => {
    assert.equal(validarSetting("contrato_modelo", ""), null);
});

test("prévia: placeholder conhecido vira o exemplo; texto em volta fica", () => {
    assert.deepEqual(partesDaMensagem("Olá {nome}!", CAT), [
        { tipo: "texto", valor: "Olá " },
        { tipo: "placeholder", valor: "Maria Fernanda Souza", original: "{nome}" },
        { tipo: "texto", valor: "!" },
    ]);
});

test("prévia: {{nome}} e { nome } também são o nome (o envio aceita as duas formas)", () => {
    assert.equal(partesDaMensagem("{{nome}}", CAT)[0].tipo, "placeholder");
    assert.equal(partesDaMensagem("{ nome }", CAT)[0].tipo, "placeholder");
    assert.equal(partesDaMensagem("{Nome}", CAT)[0].tipo, "placeholder");
});

test("prévia: placeholder desconhecido fica marcado, com o texto original", () => {
    assert.deepEqual(partesDaMensagem("Oi {nmoe}", CAT), [
        { tipo: "texto", valor: "Oi " },
        { tipo: "desconhecido", valor: "{nmoe}" },
    ]);
    // Qualquer coisa entre chaves que não esteja no catálogo, não só [a-z_].
    assert.equal(partesDaMensagem("{escola 2}", CAT)[0].tipo, "desconhecido");
});

test("prévia: chave solta não é placeholder", () => {
    assert.deepEqual(partesDaMensagem("a { b", CAT), [{ tipo: "texto", valor: "a { b" }]);
});

test("salvar: texto vazio bloqueia", () => {
    assert.equal(validarMensagem("", CAT), "Escreva a mensagem antes de salvar.");
    assert.equal(validarMensagem("   \n ", CAT), "Escreva a mensagem antes de salvar.");
});

test("salvar: placeholder fora do catálogo bloqueia e diz qual", () => {
    assert.equal(validarMensagem("Olá {nmoe}!", CAT), "Não reconheço {nmoe}. Use {nome}.");
    assert.equal(validarMensagem("{a} e {b} e {a}", CAT), "Não reconheço {a}, {b}. Use {nome}.");
});

test("salvar: texto válido passa", () => {
    assert.equal(validarMensagem("Olá {nome}! 🎉", CAT), null);
    assert.equal(validarMensagem("Sem placeholder nenhum.", CAT), null);
});

test("inserir no cursor: substitui a seleção e devolve o cursor depois do bloco", () => {
    assert.deepEqual(inserirNoCursor("Olá !", 4, 4, "{nome}"), { texto: "Olá {nome}!", cursor: 10 });
    assert.deepEqual(inserirNoCursor("Olá XX!", 4, 6, "{nome}"), { texto: "Olá {nome}!", cursor: 10 });
});

// ===== Prévia pela MESMA função do envio (19/10/2026) =====

import { applyPlaceholders } from "./settings_helper";

const texto = (partes: ReturnType<typeof previaDaMensagem>) => partes.map((p) => p.valor).join("");

test("prévia = applyPlaceholders com os exemplos do catálogo, caractere a caractere", () => {
    const cat = catalogoDaMensagem("avaliacao_mensagem", "https://g.page/r/xyz");
    const t = "Olá {{nome}}! Avalie: {{link_google}} e {link}";
    assert.equal(texto(previaDaMensagem(t, cat)), applyPlaceholders(t, { nome: "Escola Monte Verde", link_google: "https://g.page/r/xyz" }));
});

test("prévia: o que sobra entre chaves (e o envio mandaria literal) fica marcado", () => {
    const cat = catalogoDaMensagem("pos_passeio_mensagem");
    const partes = previaDaMensagem("Oi {nome}: {https://forms.gle/EXEMPLO}", cat);
    assert.deepEqual(partes.filter((p) => p.tipo === "desconhecido").map((p) => p.valor), ["{https://forms.gle/EXEMPLO}"]);
    assert.equal(texto(partes), "Oi Escola Monte Verde: {https://forms.gle/EXEMPLO}");
});
