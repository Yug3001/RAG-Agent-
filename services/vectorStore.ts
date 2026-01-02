
import { DocumentChunk } from '../types';

/**
 * Advanced Retrieval Engine
 * Implements a BM25-inspired scoring algorithm for better relevance than 
 * simple keyword matching, simulating a high-performance vector store.
 */
export class AdvancedVectorStore {
  private chunks: DocumentChunk[] = [];
  private avgDocLength: number = 0;

  addChunks(newChunks: DocumentChunk[]) {
    this.chunks = [...this.chunks, ...newChunks];
    this.calculateStats();
  }

  clear() {
    this.chunks = [];
    this.avgDocLength = 0;
  }

  private calculateStats() {
    if (this.chunks.length === 0) return;
    const totalLength = this.chunks.reduce((acc, chunk) => acc + chunk.text.length, 0);
    this.avgDocLength = totalLength / this.chunks.length;
  }

  /**
   * BM25-lite Scoring
   * f(q, D) = sum( IDF(qi) * (f(qi, D) * (k1 + 1)) / (f(qi, D) + k1 * (1 - b + b * (|D| / avgdl))) )
   */
  async retrieve(query: string, topK: number = 4): Promise<DocumentChunk[]> {
    if (this.chunks.length === 0) return [];

    const terms = query.toLowerCase()
      .split(/\W+/)
      .filter(t => t.length > 2);
    
    if (terms.length === 0) return [];

    const k1 = 1.5;
    const b = 0.75;

    // Calculate "IDF" (Inverse Document Frequency)
    const idf = (term: string) => {
      const nq = this.chunks.filter(c => c.text.toLowerCase().includes(term)).length;
      return Math.log((this.chunks.length - nq + 0.5) / (nq + 0.5) + 1);
    };

    const scoredChunks = this.chunks.map(chunk => {
      let score = 0;
      const text = chunk.text.toLowerCase();
      const docLen = text.length;

      terms.forEach(term => {
        const tf = (text.split(term).length - 1);
        const idfValue = idf(term);
        const numerator = tf * (k1 + 1);
        const denominator = tf + k1 * (1 - b + b * (docLen / this.avgDocLength));
        score += idfValue * (numerator / denominator);
      });

      return { chunk, score };
    });

    return scoredChunks
      .sort((a, b) => b.score - a.score)
      .filter(item => item.score > 0)
      .slice(0, topK)
      .map(item => item.chunk);
  }

  getStats() {
    return {
      totalChunks: this.chunks.length,
      avgChunkSize: Math.round(this.avgDocLength),
      uniqueSources: new Set(this.chunks.map(c => c.source)).size
    };
  }
}

export const vectorStore = new AdvancedVectorStore();
