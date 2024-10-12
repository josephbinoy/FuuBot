import { ChatOpenAI } from "@langchain/openai";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { PromptScore } from "../webapi/HistoryTypes";

export async function getSummary(
    fcers: string[], 
    leaderboard: PromptScore[], 
    bestaccers: string[], 
    best_acc: number, 
    avg_acc: number, 
    avg_combo: number, 
    fail_count: number, 
    no_missers: string[], 
    winner: string, 
    previousSummary: string, 
    streak:number, 
    one_missers: string[], 
    almost_fcers: string[],
    ar: number,
    bpm: number,
    cs: number,
    length: number
): Promise<string> {
    const [leaderboardString, modsUsed] = getLeaderboardString(leaderboard);
    const mapDifficultyString = getMapDifficultyString(avg_combo, avg_acc, fail_count);
    let mapDescriptionString = getMapDescriptionString(ar, bpm, cs, length);
    if (mapDescriptionString != '') {
        mapDescriptionString = `Here is some info about the map: ${mapDescriptionString}`;
    }
    const modString = (modsUsed)?'Mods are mentioned only for top players':'';
    const accerString = bestaccers.join(", ");
    const fcerString = fcers.length!=0?'Players who got FC: '+fcers.join(", "):'';
    const noMissString = no_missers.length!=0?'Players who sliderbroke: '+no_missers.join(", "):'';
    const fcInstr=(fcers.length!=0)?'If any players get full combo (FC), mention them.':'';
    const sliderInstr= (no_missers.length!=0)?'A sliderbreak means that the player got 0 misses but did not FC. If any players sliderbroke, mention them.':'';
    const streakString = streak>2?`${winner} has won ${streak} matches in a row now`:'';
    const pastString=(previousSummary=='')?'':'Here is the previous round summary, use it as context for current match: ';
    const oneMissString = one_missers.length!=0?'Players who got only one miss: '+one_missers.join(", "):'';
    const almostFCString = almost_fcers.length!=0?'Players who missed but were very close to FC: '+almost_fcers.join(", "):'';
    const prompt = ChatPromptTemplate.fromMessages([
        ["system", "You are a commentator for an osu! multi lobby. The objective is to get the highest score."],
        ["human", `Summarise the match in a maximum of 40 words. The leaderboard provided is in order of rankings. {modString} Do not reveal scores. Also at the end mention who got the highest accuracy and specify lobby average beside it in brackets.
        {fcInstr}{sliderInstr}
        Leaderboard:{leaderboardString}
        {mapDifficultyString}
        {mapDescriptionString}
        {fcerString}
        {noMissString}
        {oneMissString}
        {almostFCString}
        Highest accuracy: {best_acc}% by {accerString} (Lobby average: {avg_acc}%)
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
        leaderboardString:leaderboardString,
        fcerString:fcerString,
        best_acc:best_acc,
        avg_acc:avg_acc,
        mapDifficultyString:mapDifficultyString,
        mapDescriptionString:mapDescriptionString,
        accerString:accerString,
        noMissString:noMissString,
        fcInstr:fcInstr,
        oneMissString:oneMissString,
        almostFCString:almostFCString,
        sliderInstr:sliderInstr,
        winner: winner,
        streakString:streakString,
        pastString:pastString,
        previousSummary:previousSummary
    });
    return summary.replace(/\n/g, '');
}

function getLeaderboardString(leaderboard: PromptScore[]): [string, boolean] {
    let leaderboardString = '';
    let modsUsed = false;
    for (let i = 0; i < leaderboard.length; i++) {
        leaderboardString += `${i + 1}. ${leaderboard[i].name} scored ${leaderboard[i].score} ${(leaderboard[i].mods.length > 0 && i<3) ? `using ${leaderboard[i].mods.join('')}` : ''}`;
        if (i != leaderboard.length - 1) {
            leaderboardString += ' , ';
        }
        if (leaderboard[i].mods.length > 0){
            modsUsed=true;
        }
    }
    return [leaderboardString, modsUsed];
}

function getMapDifficultyString(avg_combo: number, avg_acc: number, fail_count: number): string {
    if (avg_acc >= 95 || avg_combo >= 80) {
        return `Players breezed through the map. `;
    }
    if (fail_count >= 60) {
        return `The map was difficult with only ${(100 - fail_count).toFixed(0)}% of players passing. `;
    }
    if (avg_acc <= 80) {
        return `The map was challenging to play. `;
    }
    if (avg_combo <= 20) {
        return `The map was difficult to score and hold combo on. `;
    }
    return "";
}

function getMapDescriptionString(ar: number, bpm:number, cs: number, length: number): string {
    let description = '';
    if (bpm && bpm >= 220) {
        description+=`The map was very fast paced, requiring quick aim and tapping. `;
    }
    if (length && length >= 330) {
        description+= `It was a long map requiring stamina and consistency from the players. `;
    }
    if (ar && ar >= 9.6) {
        description+= `The map had high AR, hence players required fast reflexes. `;
    }
    else if (ar && ar <= 8.5) {
        description+= `The map had low AR, hence players required good reading skills. `;
    }
    if (cs && cs >= 5) {
        description+= `The map featured smaller circles, hence players require precise aim. `;
    }
    return description;
}
