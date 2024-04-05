import { ChatOpenAI } from "@langchain/openai";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import 'dotenv/config';

export async function getSummary(fcers: string[], leaderboard: string, bestaccers: string[], best_acc: number, no_missers: string[]): Promise<string> {
    const accerString = bestaccers.join(", ");
    const fcerString = fcers.length!=0?'Players who got FC: '+fcers.join(", "):'';
    const noMissString = no_missers.length!=0?'Players who sliderbroke: '+no_missers.join(", "):'';
    const fcInstr=(fcers.length!=0)?'If any player gets full combo (FC), mention them.':'';
    const sliderInstr= (no_missers.length!=0)?'A sliderbreak means that the player got 0 misses but did not FC. If any player sliderbroke, mention them.':'';
    const prompt = ChatPromptTemplate.fromMessages([
            ["system", "You are a commentator for an osu! match. The objective of the game is to get highest score by clicking circles on the screen."],
            ["human", `Summarise the match in a maximum of 40 words. The leaderboard provided is in order of rankings which is based on score only. Keep in mind that usage of mods make it harder to score for that player. Do not reveal scores. Refer to mods by their acronym only. At the end mention who got the highest accuracy.
            {fcInstr}{sliderInstr}
            Leaderboard:{leaderboard}
            {fcerString}
            {noMissString}
            Highest accuracy: {best_acc}% by {accerString}`]
    ])
    const llm = new ChatOpenAI({ modelName: "gpt-3.5-turbo", temperature: 0 });

    const chain =prompt.pipe(llm).pipe(new StringOutputParser());

    const summary = await chain.invoke({
        leaderboard:leaderboard,
        fcerString:fcerString,
        best_acc:best_acc,
        accerString:accerString,
        noMissString:noMissString,
        fcInstr:fcInstr,
        sliderInstr:sliderInstr
    });
    return summary;
}


