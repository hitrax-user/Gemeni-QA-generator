


import { GoogleGenAI, Type } from "@google/genai";

if (!process.env.API_KEY) {
    // This is a placeholder check. The environment variable is expected to be set.
    // In a real app, you might have more robust error handling or a build-time check.
    console.warn("API_KEY environment variable not found. Gemini API calls will fail.");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

// Helper function to introduce a delay
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const generateQuestionsAndAnswers = async (text: string, images?: string[]): Promise<{ question: string; answer: string; }[]> => {
  if (!text.trim() && (!images || images.length === 0)) {
    // Gracefully handle empty input by returning an empty array.
    return [];
  }
  
  const model = "gemini-2.5-flash";

  const promptText = `You are an expert at creating question-and-answer pairs from technical documents for fine-tuning datasets.
Your task is to analyze the provided content, which includes text and may include images (like diagrams, schematics, or flowcharts), and generate a list of questions and their corresponding answers.

RULES:
- Generate as many relevant Q&A pairs as the content supports.
- If the content includes images (like diagrams, flowcharts, or tables embedded as images), analyze the visual information:
    - Extract text from the image (e.g., labels, values, titles).
    - Understand graphical elements (e.g., blocks, arrows, lines, their spatial relationships) to interpret processes, relationships, or sequences.
    - Integrate visual understanding with any accompanying text to form comprehensive Q&A pairs.
- When generating answers for information found in a table (whether text-based or image-based), identify the key attributes (column headers) that describe each row's entry. The answer must concisely summarize ALL relevant information found in the same row, including the values from these identified key attribute columns and the description.
- Questions MUST be specific enough to allow direct retrieval from the provided content. For information originating from a specific section or an element within an image, the question should implicitly or explicitly reference the relevant part (e.g., "According to the timing diagram, what is the speed of the conveyor?").
- While concise, questions should contain sufficient detail to differentiate between similar concepts if they appear in different contexts within the document or image.
- For questions derived from table data or diagrams, ensure the question prompts for the specific data point or relationship (e.g., "What does 1N mean in Telegram BER 1 based on the table?", "What happens after 'Scanning' in the provided diagram?").
- For non-table/non-diagram text content, answers must be extracted directly from the provided text and be concise.
- If the content is unsuitable for creating Q&A pairs (e.g., it's just a list of names, irrelevant content, or a blank image), return an empty array.
- Do not create questions about document metadata like page numbers, headers, or footers.
- You must respond in the specified JSON format.

TEXT TO ANALYZE:
---
${text || "(No text provided, analyze images only)"}
---
`;

  const schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        question: {
          type: Type.STRING,
          description: 'A simple, context-free question generated from the provided text and/or images.',
        },
        answer: {
          type: Type.STRING,
          description: 'The answer to the question, taken directly from the text and/or images.',
        },
      },
      required: ['question', 'answer'],
    },
  };

  const MAX_RETRIES = 3;
  let lastError: any = null;
  
  const contentParts: any[] = [{ text: promptText }];
  if (images && images.length > 0) {
      images.forEach(imgBase64 => {
          contentParts.push({
              inlineData: {
                  mimeType: 'image/jpeg',
                  data: imgBase64,
              },
          });
      });
  }


  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: { parts: contentParts },
            config: {
              responseMimeType: "application/json",
              responseSchema: schema,
              temperature: 0.0, // Set to 0 for more deterministic, structured output
            },
        });

        const jsonStr = response.text.trim();
        
        try {
            const parsedData = JSON.parse(jsonStr);
            if (Array.isArray(parsedData) && (parsedData.length === 0 || parsedData.every(item => typeof item === 'object' && item !== null && 'question' in item && 'answer' in item))) {
                return parsedData;
            } else {
                console.error("Model returned data that does not match the {question, answer}[] format:", parsedData);
                throw new Error("Generated JSON does not match the required Q&A format.");
            }
        } catch (parseError: any) {
            console.error("Error parsing generated JSON from API.", parseError);
            console.error("Original string from API:", `"${response.text}"`);
            throw new Error(`Failed to parse JSON response: ${parseError.message}`);
        }

    } catch (error: any) {
        lastError = error;
        console.error(`Attempt ${attempt} of ${MAX_RETRIES} failed to generate Q&A. Error:`, JSON.stringify(error, null, 2));

        // Check for specific, non-retriable errors like permission denied.
        const errorMessage = error?.message?.toLowerCase() || '';
        const errorStatus = error?.status;
        const errorCode = error?.error?.code;

        if (errorStatus === 'PERMISSION_DENIED' || errorMessage.includes('region not supported') || errorMessage.includes('api key not valid')) {
            // No point in retrying permission-based errors.
            throw new Error("API access denied. This may be due to regional restrictions or an invalid/disabled API key. Please check your API key and that you are in a supported region.");
        }
        
        // Don't retry on user location error either.
        if (errorCode === 403 && errorMessage.includes('user location is not supported')) {
             throw new Error("API access denied: User location is not supported for this model.");
        }

        if (attempt < MAX_RETRIES) {
            const delay = 1500 * Math.pow(2, attempt - 1); // Exponential backoff
            console.log(`Retrying in ${delay / 1000}s...`);
            await sleep(delay);
        }
    }
  }

  console.error("All retries failed to generate Q&A pairs.", lastError);
  
  // Check the final error to provide a more specific message.
  const lastErrorStatus = lastError?.status;
  const lastErrorBodyStatus = lastError?.error?.status;

  if (lastErrorStatus === 429 || lastErrorBodyStatus === 'RESOURCE_EXHAUSTED') {
      throw new Error(`Rate limit exceeded. The API is receiving too many requests. Please wait a moment before trying again or reduce the request frequency.`);
  }

  // Fallback to the generic error message.
  throw new Error(`Failed to generate Q&A pairs after ${MAX_RETRIES} attempts. The model may be unavailable or the content could not be processed. Check the console for details.`);
};