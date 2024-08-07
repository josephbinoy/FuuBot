import axios from 'axios';
import { load } from 'cheerio';
import { escapeUserName } from '../Player';
import { UserScore } from '../webapi/HistoryTypes';
import { secToTimeNotation } from '../plugins/MapChecker';

export interface Skill {
    skillName: string;
    skillValue: number;
}

const skillNameMapping: Record<string, string> = {
    Tenacity: 'Streaming',
    Agility: 'Aim/ Jumps',
    Accuracy: 'Click Accuracy',
    Precision: 'Small Circles',
    Reaction: 'Approach Rate'
  };

function replaceSkillName(skillnametext: string): string {
return skillNameMapping[skillnametext] || skillnametext;
}

export async function getSkills(username: string): Promise<string> {
    let result="";
    try {
        const response = await axios.get(`https://osuskills.com/user/${escapeUserName(username)}`);
        const html: string = response.data;
        
        const $ = load(html);

        const title = $('div.userRankTitle').text();
        const timeAgo = $('span.timeago').attr('title');
        if (timeAgo){
            const date = new Date(timeAgo);
            const options: Intl.DateTimeFormatOptions= {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
            }
            const readableDate = date.toLocaleDateString('en-US', options);
            const skills: Skill[] = [];
            $('ul.skillsList li').each((index, element) => {
                const skillNameText = $(element).find('div.skillLabel').text().trim();
                const skillValueText = $(element).find('output.skillValue').text().trim();
                const skillValue = Number(skillValueText);
                skills.push({ 
                    skillName: skillNameText, 
                    skillValue: isNaN(skillValue) ? 0 : skillValue 
                });
            });
            if (skills.length > 2) {
                skills.splice(skills.length - 2, 2);
            }
            result+=`[https://osuskills.com/user/${escapeUserName(username)} ${username}] has been given the title '${title}'\n`;
            skills.forEach(skill => {
                const bars = '▉'.repeat(Math.floor(skill.skillValue / 50));
                result+=` ${bars} [ ${skill.skillValue} ${replaceSkillName(skill.skillName)} ]\n`;
            });
            result+="Skills were last updated on "+readableDate+ " (Provided by [https://osuskills.com osuskills.com])";
        }
        else{
            result = "Calculating skill levels, try again in 10 minutes...";
        }
        return result;
    } catch (error) {
        return 'An error occurred while fetching skills.';
    }
}

export function calculateStats(bestScores: UserScore[], id: number, username: string): string {
    let avg_combo = 0;
    let avg_bpm = 0;
    let avg_length = 0;
    let modFrequency: Record<string, number> = {};

    for (const score of bestScores) {
        avg_combo += score.max_combo;
        if( score.mods.includes('DT') || score.mods.includes('NC') ){
            avg_bpm += score.beatmap.bpm * 1.5;
            avg_length += score.beatmap.hit_length/1.5;
        }
        else if( score.mods.includes('HT') ){
            avg_bpm += score.beatmap.bpm*0.75;
            avg_length += score.beatmap.hit_length/0.75;
        }
        else{
            avg_bpm += score.beatmap.bpm;
            avg_length += score.beatmap.hit_length;
        }
        const combinedMod = score.mods.length > 0 ? score.mods.sort().join('') : 'No Mod';
        
        if (modFrequency[combinedMod]) {
            modFrequency[combinedMod]++;
        } else {
            modFrequency[combinedMod] = 1;
        }
    }
    avg_combo /= bestScores.length;
    avg_bpm /= bestScores.length;
    avg_length /= bestScores.length;

    let modFrequencyArray = Object.entries(modFrequency);

    modFrequencyArray.sort((a, b) => b[1] - a[1]);
    
    let topTwoMods = modFrequencyArray.slice(0, 2);
    
    let modPercentages: string[] = [];
    for (const [mod, count] of topTwoMods) {
        const percentage = Math.round((count as number / bestScores.length) * 100);
        modPercentages.push(`${mod} (${percentage}%)`);
    }
    const msg = `\n[https://osu.ppy.sh/users/${id} ${username}'s] stats are: Avg Combo: ${Math.round(avg_combo)} | Avg BPM: ${Math.round(avg_bpm)} | Avg Length: ${secToTimeNotation(avg_length)} | Favorite Mods: ${modPercentages.join(', ')}`;
    return msg;
}
