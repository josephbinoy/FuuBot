import { ChatOpenAI } from "@langchain/openai";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import 'dotenv/config';

export async function getSummary(fcers: string[], leaderboard: string, bestaccers: string[], best_acc: number, no_missers: string[]): Promise<string> {
    const accerString = bestaccers.join(", ");
    const fcerString = fcers.length!=0?fcers.join(", "):'No one';
    const noMissString = no_missers.length!=0?no_missers.join(", "):'No one';
    const prompt = ChatPromptTemplate.fromMessages([
            ["system", "You are a commentator for an osu! match. The objective of the game is to get highest score by precisely aiming and clicking circles on the screen."],
            ["human", `Summarise the match in a maximum of 40 words. The leaderboard provided is in order of rankings which is based on score only. Keep in mind that usage of mods make it harder to score for that player. If any player gets full combo (FC), mention it. Highlight players who had no misses but did not win. At the end mention who got the highest accuracy. Do not reveal score.
            Leaderboard:{leaderboard}
            Players who got FC: {fcerString}
            Players with no misses: {noMissString}
            Highest accuracy: {best_acc}% by {accerString}`]
    ])
    const llm = new ChatOpenAI({ modelName: "gpt-3.5-turbo", temperature: 0 });

    const chain =prompt.pipe(llm).pipe(new StringOutputParser());

    const summary = await chain.invoke({
        leaderboard:leaderboard,
        fcerString:fcerString,
        best_acc:best_acc,
        accerString:accerString,
        noMissString:noMissString
    });
    return summary;
}


