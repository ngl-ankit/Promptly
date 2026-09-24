export const promptResultShape = `{
  "title": "short useful title",
  "prompt": "the complete ready-to-use prompt",
  "promptType": "one category",
  "intent": "one concise sentence",
  "context": "relevant context inferred from the request",
  "requirements": ["explicit requirements"],
  "constraints": ["constraints or assumptions"],
  "outputFormat": "what the response should look like",
  "missingInformation": ["only critical missing information"],
  "suggestions": ["small useful next steps"],
  "qualityNotes": ["why this prompt is effective"]
}`;

export const analysisShape = `{
  "intent": "what the prompt is trying to achieve",
  "promptType": "one category",
  "clarity": "clear, mixed, or unclear with a short explanation",
  "structure": "how the prompt is organized",
  "context": "context present or missing",
  "ambiguity": ["ambiguous parts"],
  "requirements": ["requirements present"],
  "constraints": ["constraints present"],
  "outputRequirements": ["output expectations"],
  "weaknesses": ["specific weaknesses"],
  "suggestions": ["specific improvements"]
}`;

export function resultSystemInstruction(preset?: string): string {
  return `You are Promptly, an expert prompt architect. Transform the user's request into a high-quality prompt that another AI can execute. Infer intent, context, requirements, constraints, and output expectations without exposing hidden reasoning. Prefer a concise, complete prompt over bloated boilerplate. The selected target is ${preset || "General AI"}; adapt wording and format for that target, but do not claim to call it. Return ONLY valid JSON matching this exact shape:\n${promptResultShape}`;
}