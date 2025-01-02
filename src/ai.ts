// Copyright (c) 2024 Shafil Alam

import ollama, { ModelResponse } from "ollama";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from 'openai';
import { ChatCompletionMessageParam } from "openai/resources";

import { VideoGenType } from "./videogen";
import { INITIAL_AI_PROMPT, messageVideoAIPrompt, quizVideoAIPrompt, rankVideoAIPrompt, ratherVideoAIPrompt, topicVideoAIPrompt } from "./const";

/** 
 * Function to convert video type to AI prompt
 */
export function convertVideoTypeToPrompt(videoType: VideoGenType): any {
    switch (videoType) {
        case VideoGenType.TopicVideo:
            return topicVideoAIPrompt;
        case VideoGenType.TextMessageVideo:
            return messageVideoAIPrompt;
        case VideoGenType.RatherVideo:
            return ratherVideoAIPrompt;
        case VideoGenType.RankVideo:
            return rankVideoAIPrompt;
        case VideoGenType.QuizVideo:
            return quizVideoAIPrompt;
        default:
            throw Error(`Invalid video type: '${videoType}' (maybe issue due to AI giving invalid video type)`);
    }
}

/**
 * AI generation types
 */
export enum AIGenType {
    OpenAIGen = "OpenAIGen",
    GoogleAIGen = "GoogleAIGen",
    AnthropicAIGen = "AnthropicAIGen",
    OllamaAIGen = "OllamaAIGen",
}

/**
 * AI API key environment variables
 */
export enum AIAPIEnv {
    OpenAIGen = "OPENAI_API_KEY",
    GoogleAIGen = "GOOGLE_AI_API_KEY",
    AnthropicAIGen = "ANTHROPIC_API_KEY",
}

export interface AIOptions {
    /** AI model name */
    model?: string;
    /** API endpoint (used only for OpenAI) */
    endpoint?: string;
}

/**
 * Base class for AI generation
 * @abstract
 */
export class AIGen {
    static async generate(log: (msg: string) => void, systemPrompt: string, userPrompt: string): Promise<string> {
        throw new Error("Method 'generate' must be implemented");
    }

    static async getModels(): Promise<string[]> {
        throw new Error("Method 'getModels' must be implemented");
    }
}

/**
 * AI generation using OpenAI API
 */
export class OpenAIGen extends AIGen {
    static DEFAULT_MODEL = "gpt-4o-mini";
    static DEFAULT_ENDPOINT = "https://api.openai.com/v1/";

    /**
     * Generate AI text using OpenAI API
     * @param log - Log function
     * @param systemPrompt - System prompt
     * @param userPrompt - User prompt
     * @param apiKey - OpenAI API key
     * @param options - OpenAI options
     * @returns AI generated text
     * @throws Error if API call fails
     */
    static async generate(log: (msg: string) => void, systemPrompt: string, userPrompt: string, apiKey?: string, options?: AIOptions): Promise<string> {
        try {
            const endpoint = options?.endpoint ?? this.DEFAULT_ENDPOINT;
            const model = options?.model ?? this.DEFAULT_MODEL;

            log(`Using OpenAI model: ${model}`);
            log(`Calling OpenAI API with endpoint: ${endpoint}`);

            if (apiKey == "" || apiKey == undefined) {
                log("[*] Warning: OpenAI API key is not set! Set via '--openaiAPIKey' flag or define 'OPENAI_API_KEY' environment variable.");
            }

            const client = new OpenAI({
                apiKey: apiKey,
                baseURL: endpoint,
            });

            const messages = [
                { role: 'user', content: systemPrompt },
                { role: 'user', content: INITIAL_AI_PROMPT + userPrompt }
            ];

            const response = await client.chat.completions.create({
                max_tokens: 1024,
                model: model,
                messages: messages as OpenAI.ChatCompletionMessageParam[],
                response_format: { "type": "json_object" }
            });

            let aiResponse = '';
            let videoType = '';

            videoType = response.choices[0].message.content ?? "";

            messages.push({ role: 'assistant', content: videoType });

            videoType = videoType.trim();

            // Get video type from AI response
            // JSON parse "type" and check if it matches any type in VideoGenType enum
            const videoTypeValues = Object.values<string>(VideoGenType);
            const videoTypeJson = JSON.parse(videoType)["type"];
            let matchedType = videoTypeValues.find((val) => val.toLowerCase() === videoTypeJson.toLowerCase());

            if (!matchedType) {
                log(`[*] Invalid video type (defaulting to topic): '${videoType}'`);
                matchedType = VideoGenType.TopicVideo;
            }

            log(`(OpenAI ${model}) AI said video type is '${matchedType}'`);

            const videoGenType = matchedType as VideoGenType;

            // Get AI prompts for video type
            const aiPrompt = convertVideoTypeToPrompt(videoGenType);

            // Get each prompt from each field and add to JSON
            const videoJson: any = {};

            videoJson["type"] = videoGenType;

            for (const [key, value] of Object.entries<string>(aiPrompt)) {
                const prompt = value;

                log(`(OpenAI ${model}) Will ask AI for field '${key}' with prompt '${prompt}'`);

                messages.push({ role: 'user', content: prompt });
                const response = await client.chat.completions.create({
                    max_tokens: 1024,
                    model: model,
                    messages: messages as OpenAI.ChatCompletionMessageParam[],
                });

                const res = response.choices[0].message.content ?? "";

                messages.push({ role: 'assistant', content: res });

                // Try to parse JSON response and validate it
                try {
                    const jsonRes = JSON.parse(res.trim());
                    videoJson[key] = jsonRes[key] ?? jsonRes;
                } catch (error: any) {
                    console.info(`(OpenAI ${model}) Error parsing JSON response: ${error.message}`);
                }

                log(`(OpenAI ${model}) AI said for field '${key}' is '${res}'`);
            }

            aiResponse = JSON.stringify(videoJson, null, 2);

            return aiResponse;
        } catch (error: any) {
            console.log("Error while calling OpenAI API: " + error.message);
        }
        return ""; // Return empty string if error
    }

    /**
     * Get all OpenAI models
     * @param apiKey - OpenAI API key
     * @param options - OpenAI options
     * @returns List of OpenAI models
     * @throws Error if API call fails
     */
    static async getModels(apiKey?: string, options?: AIOptions): Promise<string[]> {
        // Get all OpenAI models
        const endpoint = options?.endpoint ?? this.DEFAULT_ENDPOINT;

        if (apiKey == "" || apiKey == undefined) {
            console.info("[*] Warning: OpenAI API key is not set!");
        }

        const client = new OpenAI({
            apiKey: apiKey,
            baseURL: endpoint,
        });

        const response = await client.models.list();

        const models = response.data.map((model: any) => model.id);

        return models;
    }
}

/**
 * AI generation using Google Gemini API
 */
export class GoogleAIGen extends AIGen {
    static DEFAULT_MODEL = "gemini-1.5-flash";
    static DEFAULT_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta";

    /**
     * Generate AI text using Google Gemini API
     * @param log - Log function
     * @param systemPrompt - System prompt
     * @param userPrompt - User prompt
     * @param apiKey - Google Gemini API key
     * @param options - Google Gemini AI options
     * @returns AI generated text
     * @throws Error if API call fails
     */
    static async generate(log: (msg: string) => void, systemPrompt: string, userPrompt: string, apiKey?: string, options?: AIOptions): Promise<string> {
        const endpoint = this.DEFAULT_ENDPOINT;
        const model = options?.model ?? this.DEFAULT_MODEL;

        log(`Using Google AI model: ${model}`);
        log(`Calling Google AI API with endpoint: ${endpoint}`);

        if (apiKey == "" || apiKey == undefined) {
            throw Error("Google AI API key is not set! Set via '--googleaiAPIKey' flag or define 'GOOGLE_AI_API_KEY' environment variable.");
        }

        let aiResponse = '';

        const ai = new GoogleGenerativeAI(apiKey);
        const geminiModel = ai.getGenerativeModel({ model: model });
        const chat = await geminiModel.startChat({
            history: [
                { role: "user", parts: [{ text: systemPrompt }] }
            ]
        })

        const videoTypeResult = await chat.sendMessageStream(INITIAL_AI_PROMPT + userPrompt);
        let videoType = '';

        for await (const part of videoTypeResult.stream) {
            videoType += part.text();
            log(`AI Response chunk for 'type' -> ${part.text().trim()}`);
        }

        videoType = videoType.trim();

        // Get AI prompts for video type
        // Check if AI string matches any type in VideoGenType enum
        const videoTypeValues = Object.values<string>(VideoGenType);
        let matchedType = videoTypeValues.find((val) => val.toLowerCase() === videoType.toLowerCase());

        if (!matchedType) {
            log(`[*] Invalid video type (defaulting to topic): '${videoType}'`);
            matchedType = VideoGenType.TopicVideo;
        }

        log(`(Google AI ${model}) AI said video type is '${matchedType}'`);

        const videoGenType = matchedType as VideoGenType;

        const aiPrompt = convertVideoTypeToPrompt(videoGenType);

        // Get each prompt from each field and add to JSON
        const videoJson: any = {};

        videoJson["type"] = videoGenType;

        for (const [key, value] of Object.entries<string>(aiPrompt)) {
            const prompt = value;

            log(`(Google AI ${model}) Will ask AI for field '${key}' with prompt '${prompt}'`);

            const result = await chat.sendMessageStream(prompt);
            let res = '';
            for await (const part of result.stream) {
                res += part.text();
                log(`AI Response chunk for '${key}' -> ${part.text().trim()}`);
            }

            // Try to parse JSON response and validate it
            try {
                const jsonRes = JSON.parse(res.trim());
                videoJson[key] = jsonRes[key] ?? jsonRes;
            } catch (error: any) {
                console.info(`(Google AI ${model}) Error parsing JSON response: ${error.message}`);
            }

            log(`(Google AI ${model}) AI said for field '${key}' is '${res}'`);
        }

        aiResponse = JSON.stringify(videoJson, null, 2);

        return aiResponse;
    }

    static async getModels(): Promise<string[]> {
        // Return list of Google Gemini AI models
        return [
            "gemini-1.5-flash",
            "gemini-1.5-pro",
            "gemini-1.0-pro",
            "aqa"
        ];
    }
}

/**
 * AI generation using Anthropic AI
 */
export class AnthropicAIGen extends AIGen {
    static DEFAULT_MODEL = "claude-3-5-sonnet-20240620";
    static DEFAULT_ENDPOINT = "https://api.anthropic.com/v1";

    /**
     * Generate AI text using Anthropic API
     * @param log - Log function
     * @param systemPrompt - System prompt
     * @param userPrompt - User prompt
     * @param apiKey - Anthropic API key
     * @param options - Anthropic AI options
     * @returns AI generated text
     * @throws Error if API call fails
     */
    static async generate(log: (msg: string) => void, systemPrompt: string, userPrompt: string, apiKey?: string, options?: AIOptions): Promise<string> {
        const endpoint = this.DEFAULT_ENDPOINT;
        const model = options?.model ?? this.DEFAULT_MODEL;

        log(`Using Anthropic AI model: ${model}`);
        log(`Calling Anthropic AI API with endpoint: ${endpoint}`);

        if (apiKey == "" || apiKey == undefined) {
            throw Error("Anthropic AI API key is not set! Set via '--anthropicAPIKey' flag or define 'ANTHROPIC_API_KEY' environment variable.");
        }

        const headers = {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        };

        const messages = [
            { role: 'user', content: systemPrompt },
            { role: 'user', content: INITIAL_AI_PROMPT + userPrompt }
        ]

        const data = {
            model: model,
            messages: messages,
        };

        const response = await fetch(endpoint + "/messages", {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            throw new Error("Failed to call Anthropic AI API: " + response.statusText);
        }

        const json = await response.json();

        const videoType = json.content[0].text;

        // Get AI prompts for video type
        // Check if AI string matches any type in VideoGenType enum
        const videoTypeValues = Object.values<string>(VideoGenType);
        let matchedType = videoTypeValues.find((val) => val.toLowerCase() === videoType.toLowerCase());

        if (!matchedType) {
            log(`[*] Invalid video type (defaulting to topic): '${videoType}'`);
            matchedType = VideoGenType.TopicVideo;
        }

        log(`(Anthropic ${model}) AI said video type is '${matchedType}'`);

        const videoGenType = matchedType as VideoGenType;

        // Get AI prompts for video type
        const aiPrompt = convertVideoTypeToPrompt(videoGenType);

        // Get each prompt from each field and add to JSON
        const videoJson: any = {};

        videoJson["type"] = videoGenType;

        for (const [key, value] of Object.entries<string>(aiPrompt)) {
            const prompt = value;

            log(`(Anthropic ${model}) Will ask AI for field '${key}' with prompt '${prompt}'`);

            messages.push({ role: 'user', content: prompt });

            const data = {
                model: model,
                messages: messages,
            };

            const response = await fetch(endpoint + "/messages", {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(data),
            });

            if (!response.ok) {
                throw new Error("Failed to call Anthropic AI API: " + response.statusText);
            }

            const json = await response.json();

            const res: string = json.content[0].text;

            // Try to parse JSON response and validate it
            try {
                const jsonRes = JSON.parse(res.trim());
                videoJson[key] = jsonRes[key] ?? jsonRes;
            } catch (error: any) {
                console.info(`(Anthropic AI ${model}) Error parsing JSON response: ${error.message}`);
            }

            log(`(Anthropic ${model}) AI said for field '${key}' is '${res}'`);
        }

        const aiResponse = JSON.stringify(videoJson, null, 2);

        return aiResponse;
    }

    static async getModels(): Promise<string[]> {
        // Return list of Anthropic claude AI models
        return [
            "claude-3-5-sonnet-20240620",
            "claude-3-opus-20240229",
            "claude-3-sonnet-20240229",
            "claude-3-haiku-20240307"
        ];
    }
}

/**
 * AI generation using Ollama API
 */
export class OllamaAIGen extends AIGen {
    /** Default model name */
    static DEFAULT_MODEL = "llama3.2";

    /**
     * Generate AI text using Ollama local API
     * @param log - Log function
     * @param systemPrompt - System prompt
     * @param userPrompt - User prompt
     * @param options - Ollama AI options
     * @returns AI generated text
     * @throws Error if API call fails
     */
    static async generate(log: (msg: string) => void, systemPrompt: string, userPrompt: string, options?: AIOptions): Promise<string> {
        const model = options?.model ?? this.DEFAULT_MODEL;
        log(`Calling Ollama local API with model: ${model}`);

        let aiResponse = '';
        try {

            let videoType = '';

            const messages = [
                { role: 'user', content: systemPrompt },
                { role: 'user', content: INITIAL_AI_PROMPT + userPrompt }
            ];
            const response = await ollama.chat({ model: model, messages: messages, stream: true })

            for await (const part of response) {
                const msgChunk = part.message.content;
                videoType += msgChunk;
                log(`AI Response chunk for 'type' -> ${msgChunk.trim()}`);
            }

            messages.push({ role: 'assistant', content: videoType });

            videoType = videoType.trim();

            // Get AI prompts for video type
            // Check if AI string matches any type in VideoGenType enum
            const videoTypeValues = Object.values<string>(VideoGenType);
            let matchedType = videoTypeValues.find((val) => val.toLowerCase() === videoType.toLowerCase());

            if (!matchedType) {
                log(`[*] Invalid video type (defaulting to topic): '${videoType}'`);
                matchedType = VideoGenType.TopicVideo;
            }

            log(`(Ollama ${model}) AI said video type is '${matchedType}'`);

            const videoGenType = matchedType as VideoGenType;

            const aiPrompt = convertVideoTypeToPrompt(videoGenType);

            // Get each prompt from each field and add to JSON
            const videoJson: any = {};

            videoJson["type"] = videoGenType;

            for (const [key, value] of Object.entries<string>(aiPrompt)) {
                const prompt = value;

                log(`(Ollama ${model}) Will ask AI for field '${key}' with prompt '${prompt}'`);

                messages.push({ role: 'user', content: prompt });

                const response = await ollama.chat({ model: model, messages: messages, stream: true, format: 'json' });

                let res = '';
                for await (const part of response) {
                    const msgChunk = part.message.content;
                    res += msgChunk;
                    log(`AI Response chunk for '${key}' -> ${msgChunk.trim()}`);
                }

                messages.push({ role: 'assistant', content: res });

                // Try to parse JSON response and validate it
                try {
                    const jsonRes = JSON.parse(res);
                    videoJson[key] = jsonRes[key] ?? jsonRes;
                } catch (error: any) {
                    console.info(`(Ollama ${model}) Error parsing JSON response: ${error.message}`);
                }

                log(`(Ollama ${model}) AI said for field '${key}' is '${res}'`);
            }

            aiResponse = JSON.stringify(videoJson, null, 2);

            return aiResponse;

        } catch (error: any) {
            log("Error while calling Ollama API: " + error.message);
            throw new Error("Error while calling Ollama API: " + error.message);
        }
    }

    /**
     * Get all Ollama models
     * @returns List of Ollama models
     * @throws Error if API call fails
     */
    static async getModels(): Promise<string[]> {
        // Get all Ollama models
        const response = await ollama.list();
        const models = response.models.map((model: ModelResponse) => model.name);

        return models;
    }
}
