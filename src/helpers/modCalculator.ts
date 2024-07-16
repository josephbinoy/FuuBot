export function odDT(od: number) {
    const range300 = (79 - (od * 6) + 0.5) * 2 / 3
    const od_num= parseFloat(((79.5 - range300) / 6).toFixed(2)) > 11 ? 11 : parseFloat(((79.5 - range300) / 6).toFixed(2))
    return od_num;
}

export function odHT(od: number) {
    const range300 = (79 - (od * 6) + 0.5) * 4 / 3
    const od_num= parseFloat(((79.5 - range300) / 6).toFixed(2)) > 11 ? 11 : parseFloat(((79.5 - range300) / 6).toFixed(2))
    return od_num;
}

export function toHR(cs: number, ar: number, od: number, hp: number) {

    const hrobj = {
        cs: cs * 1.3 > 10 ? 10 : cs * 1.3,
        ar: ar * 1.4 > 10 ? 10 : ar * 1.4,
        od: od * 1.4 > 10 ? 10 : od * 1.4,
        hp: hp * 1.4 > 10 ? 10 : hp * 1.4,
    }
    return hrobj;
}

export function toEZ(cs: number, ar: number, od: number, hp: number) {

    const ezobj = {
        cs: cs / 2 > 10 ? 10 : cs / 2,
        ar: ar / 2 > 10 ? 10 : ar / 2,
        od: od / 2 > 10 ? 10 : od / 2,
        hp: hp / 2 > 10 ? 10 : hp / 2,
    }
    return ezobj;
}

export function DoubleTimeAR(ar: number) {
    const ms = ar > 5 ? 200 + (11 - ar) * 100 : 800 + (5 - ar) * 80;
    let newAR: number;
    if (ms < 300) {
        newAR = 11
    }
    else if (ms < 1200) {
        newAR = Math.round((11 - (ms - 300) / 150) * 100) / 100;
    }
    else {
        newAR = Math.round((5 - (ms - 1200) / 120) * 100) / 100;
    }
    return newAR;
}

export function HalfTimeAR(ar: number) {
    let newAR: number;
    const ogtoms = ar > 5 ? 200 + (11 - ar) * 100 : 800 + (5 - ar) * 80;
    const ms = ogtoms * (4 / 3);

    if (ms < 300) {
        newAR = 11
    }
    else if (ms < 1200) {
        newAR = Math.round((11 - (ms - 300) / 150) * 100) / 100;
    }
    else {
        newAR = Math.round((5 - (ms - 1200) / 120) * 100) / 100;
    }
    return newAR;
}