import axios from 'axios';
import { load } from 'cheerio';
import { escapeUserName } from '../Player';

export interface Skill {
    skillName: string;
    skillValue: number;
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
            result+=`[https://osuskills.com/user/${escapeUserName(username)} ${escapeUserName(username)}] has been given the title '${title}'\n`;
            skills.forEach(skill => {
                const bars = '▉'.repeat(Math.floor(skill.skillValue / 50));
                result+=` ${bars} (${skill.skillValue} ${skill.skillName})\n`;
            });
            result+="Skills were last updated on "+readableDate;
        }
        else{
            result = "Calculating skill levels, try again in 10 minutes...";
        }
        return result;
    } catch (error) {
        return 'An error occurred while fetching the skills.';
    }
}
