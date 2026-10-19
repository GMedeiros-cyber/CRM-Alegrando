/**
 * O que a tela (cliente) precisa saber do contrato, sem puxar docxtemplater e
 * pizzip para o navegador: o catálogo de campos, o limite do arquivo e o tipo
 * da informação das versões guardadas.
 */

/** Os campos que o modelo pode usar, com o que cada um preenche (a tela lista isto). */
export const CAMPOS_CONTRATO: ReadonlyArray<{ chave: string; descricao: string }> = [
    { chave: "escola", descricao: "Nome do lead" },
    { chave: "cnpj", descricao: "CNPJ do lead" },
    { chave: "endereco", descricao: "Endereço do lead" },
    { chave: "representante_escola", descricao: "Responsável do lead; se vazio, a diretora; se vazia, a coordenadora" },
    { chave: "data_extenso", descricao: "Data de hoje por extenso, em São Paulo (19 de outubro de 2026)" },
    { chave: "destino", descricao: "Destino do contrato" },
    { chave: "data_passeio", descricao: "Data do passeio (dd/mm/aaaa)" },
    { chave: "qtd_alunos", descricao: "Quantidade de alunos" },
    { chave: "qtd_professores", descricao: "Professores e acompanhantes" },
    { chave: "valor_por_aluno", descricao: "Valor por aluno (R$ 90,00)" },
    { chave: "valor_total", descricao: "Valor total (R$ 3.420,00)" },
    { chave: "forma_pagamento", descricao: "Forma de pagamento do contrato" },
    { chave: "observacoes", descricao: "Observações do contrato" },
];
/**
 * 4 MB, e não os 5 MB do bucket: o arquivo chega por server action, e a Vercel
 * recusa corpo de requisição acima de 4,5 MB antes de o código rodar — com 5 MB
 * a pessoa veria um erro genérico em vez deste aviso. Um contrato tem ~20 KB.
 */
export const LIMITE_MODELO_BYTES = 4 * 1024 * 1024;

export type InfoModelos = Record<"atual" | "anterior", { atualizadoEm: string } | null>;
