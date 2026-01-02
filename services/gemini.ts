
import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { ChatMessage, ModelType } from "../types";

export class GeminiService {
  constructor() {}

  private buildRequest(prompt: string, context: string, history: ChatMessage[], useSearch: boolean, strictMode: boolean) {
    const systemInstruction = `
      [PROTOCOL: NEURAL MODALITY CLASSIFIER]
      Identify the modality of the provided CONTEXT (text, pdf, image, table, code, mixed).

      [PROTOCOL: MULTI-MODAL REASONING CORE]
      Synthesize all data points within the CONTEXT. Cross-reference information to find patterns.

      [PROTOCOL: HALLUCINATION GUARDRAIL]
      ${strictMode ? `
      STRICT MODE ACTIVE. 
      - Use ONLY the provided CONTEXT. 
      - If unsure, say "I couldn't find this information in the provided data."` : `
      HYBRID MODE. Supplement CONTEXT with general knowledge if necessary, but label it clearly.`}

      [PROTOCOL: EXPLAINABILITY & TRANSPARENCY]
      Every response MUST conclude with a structured "Transparency Block" starting with the delimiter "---REASONING_METADATA---".
      Within this block, provide exactly these three fields:
      1. SOURCES USED: List filenames of the chunks you actually used to formulate the answer.
      2. REASONING PATH: A 1-sentence summary of how you connected the sources to the user's query.
      3. CONFIDENCE LEVEL: State "High", "Medium", or "Low" based on the clarity and relevance of the context.

      CONTEXT DATA STREAM:
      ${context}
    `;

    const contents = history.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));

    contents.push({
      role: 'user',
      parts: [{ text: prompt }]
    });

    const config: any = {
      systemInstruction,
      temperature: strictMode ? 0.0 : 0.6,
      topP: 0.9,
      topK: 40,
    };

    if (useSearch && !strictMode) {
      config.tools = [{ googleSearch: {} }];
    }

    return { contents, config };
  }

  async *generateRAGResponseStream(
    prompt: string, 
    context: string, 
    history: ChatMessage[],
    useSearch: boolean = false,
    strictMode: boolean = true
  ) {
    // Initializing GoogleGenAI with named parameter apiKey as per guidelines
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const { contents, config } = this.buildRequest(prompt, context, history, useSearch, strictMode);

    const result = await ai.models.generateContentStream({
      model: ModelType.FLASH,
      contents,
      config,
    });

    for await (const chunk of result) {
      // Access text directly from the chunk as it is a GenerateContentResponse
      yield chunk;
    }
  }
}

export const geminiService = new GeminiService();
