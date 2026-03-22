import re
import os
from dotenv import load_dotenv

# Carregar o arquivo .env localizado na pasta frontend
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
dotenv_path = os.path.join(BASE_DIR, "frontend", ".env")
load_dotenv(dotenv_path)

# Glossário de Termos de Administração que não devem ser traduzidos, mas explicados
GLOSSARY = {
    "supply chain": "Cadeia de Suprimentos",
    "marketing": "Estratégia de Mercado / Mercadologia",
    "core competence": "Competência Essencial",
    "framework": "Estrutura Conceitual / Matriz",
    "background": "Contextualização / Histórico",
    "pipeline": "Fluxo de Trabalho",
    "know-how": "Conhecimento Prático / Expertise",
    "benchmark": "Padrão de Referência",
    "brainstorming": "Tempestade de Ideias",
    "feedback": "Retorno / Avaliação",
    "bottom line": "Resultado Final / Lucro Líquido",
    "stakeholder": "Parte Interessada",
    "shareholder": "Acionista",
    "outsourcing": "Terceirização",
    "joint venture": "Empreendimento Conjunto",
    "lean": "Enxuto"
}

def translate_text(text: str, provider: str = "gemini") -> str:
    prompt = f"""Você é um tradutor acadêmico especialista em Administração. 
    Traduza o seguinte texto do MESTRADO para o Português do Brasil de forma RIGOROSA.
    
    REGRA CRÍTICA: Termos globais consagrados na Administração (ex: supply chain, marketing, framework, background, pipeline, benchmarking, lean, stakeholders) 
    NÃO devem ser traduzidos diretamente, mas sim mantidos em inglês e explicados brevemente em português entre parênteses.
    NUNCA deixe partes sem tradução.
    
    Texto para traduzir:
    {text}"""

    # 1. Tradução via ChatGPT (OpenAI)
    if provider == "openai":
        import openai
        # A chave no .env deles está GPT_API_KEY
        api_key = os.environ.get("GPT_API_KEY")
        if api_key:
             try:
                  client = openai.OpenAI(api_key=api_key)
                  response = client.chat.completions.create(
                      model="gpt-4o",
                      messages=[{"role": "user", "content": prompt}]
                  )
                  return response.choices[0].message.content
             except Exception as e:
                  return text + f"\n\n[Erro no ChatGPT: {str(e)}]"

    # 2. Tradução via Gemini
    elif provider == "gemini":
        from google import genai
        api_key = os.environ.get("GEMINI_API_KEY")
        if api_key:
             try:
                  client = genai.Client(api_key=api_key)
                  response = client.models.generate_content(
                       model='gemini-2.5-pro',
                       contents=prompt
                  )
                  return response.text
             except Exception as e:
                  return text + f"\n\n[Erro no Gemini: {str(e)}]"

    # Fallback se nenhuma chave de API estiver no ambiente (Usa glossário simples)
    translated_text = text
    sorted_terms = sorted(GLOSSARY.keys(), key=len, reverse=True)
    for term in sorted_terms:
        # Match case insensitive
        pattern = re.compile(rf'\b{term}\b', re.IGNORECASE)
        explanation = GLOSSARY[term]
        translated_text = pattern.sub(lambda m: f"{m.group(0)} ({explanation})", translated_text)
        
    return translated_text

def format_latex(translated_text: str, images_list=None, section_title="Módulo Traduzido") -> str:
    latex = r"\section{" + section_title + r"}" + "\n\n"
    if images_list:
        for img_path in images_list:
            clean_path = img_path.replace("\\", "/")
            latex += r"\begin{figure}[H]" + "\n"
            latex += r"  \centering" + "\n"
            latex += r"  \includegraphics[width=0.8\textwidth]{" + clean_path + "}\n"
            latex += r"  \caption{Figura extraída}" + "\n"
            latex += r"\end{figure}" + "\n\n"
    clean_text = translated_text.replace("\n", " \n\n")
    latex += clean_text + "\n\n"
    return latex
