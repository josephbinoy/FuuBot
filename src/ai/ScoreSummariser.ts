import { ChatOpenAI } from "@langchain/openai";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import 'dotenv/config';

export async function getSummary(maxCombo: number, leaderboard: string): Promise<string> {
    const prompt = ChatPromptTemplate.fromMessages([
            ["system", "You are a commentator for a multiplayer game called osu. The match has just ended. Leaderboard provided is in order of rankings."],
            ["human", `Briefly summarise the match. Do not reveal anyone's scores. Be very concise. First sentence should describe the match, whether it was a close match or one sided etc. Use a maximum of 50 words.
            Max possible combo: {max}
            Leaderboard:{leaderboard}`]
    ])
    const llm = new ChatOpenAI({ modelName: "gpt-3.5-turbo", temperature: 0 });

    const chain =prompt.pipe(llm).pipe(new StringOutputParser());

    const summary = await chain.invoke({
        max:maxCombo,
        leaderboard:leaderboard
    });
    return summary;
}


