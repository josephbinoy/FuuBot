import { ChatOpenAI } from "@langchain/openai";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import 'dotenv/config';

export async function getSummary(fcers: string[], leaderboard: string, bestaccers: string[], best_acc: number): Promise<string> {
    const accerString = bestaccers.join(", ");
    const fcerString = fcers.length!=0?fcers.join(", "):'No one';
    const prompt = ChatPromptTemplate.fromMessages([
            ["system", "You are a commentator for an osu multiplayer match"],
            ["human", `Summarise the match in maximum of 40 words. The leaderboard provided is in order of rankings. DO NOT reveal score or combo values. Keep in mind that the mods HD, HR and FL make it harder to score for that player. If any player gets full combo(FC) mention it. At the end mention who got the highest accuracy.
            Leaderboard:{leaderboard}
            Players who got FC: {fcerString}
            Highest accuracy: {best_acc}% by {accerString}`]
    ])
    const llm = new ChatOpenAI({ modelName: "gpt-3.5-turbo", temperature: 0 });

    const chain =prompt.pipe(llm).pipe(new StringOutputParser());

    const summary = await chain.invoke({
        leaderboard:leaderboard,
        fcerString:fcerString,
        best_acc:best_acc,
        accerString:accerString
    });
    return summary;
}


