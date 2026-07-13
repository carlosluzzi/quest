// api/extrair-pdf.js
// Função serverless do Vercel. A chave da Anthropic fica só aqui (variável
// de ambiente ANTHROPIC_API_KEY, configurada no painel do Vercel), nunca
// exposta no navegador.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Método não permitido' });
  }

  const { pdfBase64, nomeArquivo } = req.body || {};
  if (!pdfBase64) {
    return res.status(400).json({ erro: 'Nenhum PDF enviado' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ erro: 'ANTHROPIC_API_KEY não configurada no projeto Vercel' });
  }

  const prompt = `Você vai receber um PDF com questões de múltipla escolha pra um processo seletivo de praticagem (PSCPP). Extraia TODAS as questões do PDF inteiro numa lista JSON.

Pra cada questão, devolva um objeto com estes campos exatos:
- enunciado: texto limpo do enunciado, sem "GABARITO:", sem ícones, sem casca visual da fonte
- alternativas: as 5 alternativas normalizadas no formato "(a) texto. (b) texto. (c) texto. (d) texto. (e) texto."
- gabarito: só a letra correta, minúscula (ex: "c")
- capitulo: se identificável no PDF, o número/nome do capítulo da publicação de origem; senão null
- tipo_questao: um destes valores exatos — "Conceitual", "Cálculo", "Número", "Lista", "Identificação", "Outro". Use "Lista" quando as alternativas finais combinarem assertivas romanas (ex: "apenas I e III corretas").
- modulo_pscpp: um destes valores exatos — "Manobrabilidade", "Arte Naval", "Navegação em Águas Restritas", "Legislação", "Meteorologia e Oceanografia", "Comunicações", "Conhecimentos Gerais"
- explicacao: se o PDF já trouxer uma explicação/resolução pronta pra essa questão, o texto dela (corrido, não estruturado por alternativa); senão null

Responda APENAS com um JSON válido no formato {"questoes": [...]}, sem nenhum texto antes ou depois, sem marcação markdown, sem \`\`\`json.`;

  try {
    const respostaAnthropic = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8192,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    if (!respostaAnthropic.ok) {
      const detalhe = await respostaAnthropic.text();
      return res.status(502).json({ erro: 'Erro na API da Anthropic', detalhe });
    }

    const dados = await respostaAnthropic.json();
    const textoResposta = (dados.content || []).map(b => b.text || '').join('');

    let parsed;
    try {
      parsed = JSON.parse(textoResposta);
    } catch (e) {
      return res.status(502).json({ erro: 'Resposta da IA não veio em JSON válido', bruto: textoResposta.slice(0, 500) });
    }

    return res.status(200).json({ questoes: parsed.questoes || [] });

  } catch (erro) {
    return res.status(500).json({ erro: 'Falha inesperada na extração', detalhe: String(erro) });
  }
}
