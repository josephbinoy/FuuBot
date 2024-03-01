import { ChatOpenAI } from "@langchain/openai";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import 'dotenv/config';

export async function getSummary(maxCombo: number, leaderboard: string, bestaccers: string[], best_acc: number): Promise<string> {
    const accerString = bestaccers.join(", ");
    const prompt = ChatPromptTemplate.fromMessages([
            ["system", "You are a commentator for a multiplayer game called osu. The match has just ended. Leaderboard provided is in order of rankings which is based on score alone."],
            ["human", `Summarise the match. Do not reveal any scores or combo. At the end, tell what the highest accuracy was and by who. If any players got the full combo(FC), mention that as well.Use a maximum of 40 words.
            combo needed for FC : {max}
            Leaderboard:{leaderboard}
            Highest accuracy: {best_acc}% by {accerString}`]
    ])
    const llm = new ChatOpenAI({ modelName: "gpt-3.5-turbo", temperature: 0 });

    const chain =prompt.pipe(llm).pipe(new StringOutputParser());

    const summary = await chain.invoke({
        max:maxCombo,
        leaderboard:leaderboard,
        best_acc:best_acc,
        accerString:accerString
    });
    return summary;
}


