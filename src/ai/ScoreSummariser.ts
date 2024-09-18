import { ChatOpenAI } from "@langchain/openai";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate } from "@langchain/core/prompts";

export async function getSummary(fcers: string[], leaderboard: string, bestaccers: string[], best_acc: number, no_missers: string[], winner: string, modsUsed: boolean, previousSummary: string, streak:number): Promise<string> {
    const modString = (modsUsed)?'Keep in mind that usage of mods makes it harder to score for that player. Do not specify mod name, only use mod acronyms like HD, HR etc.':'';
    const accerString = bestaccers.join(", ");
    const fcerString = fcers.length!=0?'Players who got FC: '+fcers.join(", "):'';
    const noMissString = no_missers.length!=0?'Players who sliderbroke: '+no_missers.join(", "):'';
    const fcInstr=(fcers.length!=0)?'If any players get full combo (FC), mention them.':'';
    const sliderInstr= (no_missers.length!=0)?'A sliderbreak means that the player got 0 misses but did not FC. If any players sliderbroke, mention them.':'';
    const streakString = streak>2?`${winner} has won ${streak} matches in a row now`:'';
    const pastString=(previousSummary=='')?'':'Previous match summary context: ';
    const prompt = ChatPromptTemplate.fromMessages([
            ["system", "You are a commentator for an osu! multi lobby. Highlight only the top performers. The objective is to get the highest score."],
            ["human", `Summarise the match in a maximum of 40 words. The leaderboard provided is in order of rankings. {modString} Do not reveal scores. Also at the end mention who got the highest accuracy.
            {fcInstr}{sliderInstr}
            Leaderboard:{leaderboard}
            {fcerString}
            {noMissString}
            Highest accuracy: {best_acc}% by {accerString}
            Match Winner: {winner}
            {streakString}
            {pastString}
            {previousSummary}
            `]
    ])
    const llm = new ChatOpenAI({ modelName: "gpt-4o-mini", temperature: 0 });

    const chain =prompt.pipe(llm).pipe(new StringOutputParser());

    const summary = await chain.invoke({
        modString:modString,
        leaderboard:leaderboard,
        fcerString:fcerString,
        best_acc:best_acc,
        accerString:accerString,
        noMissString:noMissString,
        fcInstr:fcInstr,
        sliderInstr:sliderInstr,
        winner: winner,
        streakString:streakString,
        pastString:pastString,
        previousSummary:previousSummary
    });
    return summary;
}


