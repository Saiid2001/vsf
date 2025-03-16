type Instance = {
    response: any;
    responseHeaders: any;
    request: any;
    requestHeaders: any;
};

function responseCodes(
    swapR: Instance,
    userdiffR1: Instance,
    userdiffR2: Instance,
) {
    const matchesR1 = swapR.response.status_code === userdiffR1.response.status_code;
    const matchesR2 = swapR.response.status_code === userdiffR2.response.status_code;

    let message = `Status Code ${swapR.response.status_code}`;

    if (matchesR1 && matchesR2) {
        message += ' matches both responses';
    }
    else if (matchesR1) {
        message += ' matches response 1';
    }
    else if (matchesR2) {
        message += ' matches response 2';
    }
    else {
        message += ' UNLIKE both responses';
    }

    return {
        "status code matching": message,
    }

}



function _levenshteinDistance(s: string, t: string) {
    if (!s.length) return t.length;
    if (!t.length) return s.length;
    const arr = [];
    for (let i = 0; i <= t.length; i++) {
      arr[i] = [i];
      for (let j = 1; j <= s.length; j++) {
        arr[i][j] =
          i === 0
            ? j
            : Math.min(
                arr[i - 1][j] + 1,
                arr[i][j - 1] + 1,
                arr[i - 1][j - 1] + (s[j - 1] === t[i - 1] ? 0 : 1)
              );
      }
    }
    return arr[t.length][s.length];
}

function _longestCommonSubstringLength(s: string, t: string) {
    const dp = Array(s.length + 1)
        .fill(0)
        .map(() => Array(t.length + 1).fill(0));

    let max = 0;

    for (let i = 1; i <= s.length; i++) {
        for (let j = 1; j <= t.length; j++) {
            if (s[i - 1] === t[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
                max = Math.max(max, dp[i][j]);
            }
        }
    }

    return max;
}

function _keywordDistance(s: string, t: string) {
    const sWords = s.split(/[\s:"'\}\{.,]+/);
    const tWords = t.split(/[\s:"'\}\{.,]+/);
    
    let keywords1 = new Set(sWords);
    let keywords2 = new Set(tWords);

    let common = new Set(sWords.filter(x => keywords2.has(x)));

    return common.size;
}

function _hasKeywords(s: string, keywords: string[]) {  
    return keywords.some(keyword => s.includes(keyword));
}

function responseBodies(
    swapR: Instance,
    userdiffR1: Instance,
    userdiffR2: Instance,
){

    const swapBody = swapR.response.body;
    const userdiffBody1 = userdiffR1.response.body;
    const userdiffBody2 = userdiffR2.response.body;

    const distance1 = _levenshteinDistance(swapBody, userdiffBody1);
    const distance2 = _levenshteinDistance(swapBody, userdiffBody2);

    const distance1Keywords = _keywordDistance(swapBody, userdiffBody1);
    const distance2Keywords = _keywordDistance(swapBody, userdiffBody2);

    const longestCommonSubstringLength1 = _longestCommonSubstringLength(swapBody, userdiffBody1);
    const longestCommonSubstringLength2 = _longestCommonSubstringLength(swapBody, userdiffBody2);


    let containingAlice = [];
    let containingBob = [];

    for (let [key, instance] of [['swap', swapBody], ['userdiff1', userdiffBody1], ['userdiff2', userdiffBody2]]) {
        if (_hasKeywords(instance.toLowerCase(), ["alice"])) {
            containingAlice.push(key);
        }
    }

    for (let [key, instance] of [['swap', swapBody], ['userdiff1', userdiffBody1], ['userdiff2', userdiffBody2]]) {
        if (_hasKeywords(instance.toLowerCase(), ["bob"])) {
            containingBob.push(key);
        }
    }

    return {
        "body distance 1": distance1,
        "body distance 2": distance2,
        "closest body": distance1 < distance2 ? "response 1" : "response 2",
        "keyword distance 1": distance1Keywords,
        "keyword distance 2": distance2Keywords,
        "closest keywords": distance1Keywords > distance2Keywords ? "response 1" : "response 2",
        "longest common substring 1": longestCommonSubstringLength1,    
        "longest common substring 2": longestCommonSubstringLength2,
        "longest common substring": longestCommonSubstringLength1 > longestCommonSubstringLength2 ? "response 1" : "response 2",
        "has alice": containingAlice.join(", "),
        "has bob": containingBob.join(", "),
    }

}

export function CandidateQues(
    props: {
        swapR?: Instance,
        userdiffR1?: Instance,
        userdiffR2?: Instance,
    }
) {

    if (!props.swapR || !props.userdiffR1 || !props.userdiffR2) {
        return <div></div>
    }

    const statusCodeQues= responseCodes(props.swapR, props.userdiffR1, props.userdiffR2);
    const bodyQues = responseBodies(props.swapR, props.userdiffR1, props.userdiffR2);

    const ques = {
        ...statusCodeQues,
        ...bodyQues,
    }

    return <div>
        <h3>Ques</h3>
        {/* create a table */}
        <table>
            <tbody>
                {Object.entries(ques).map(([key, value]) => {
                    return <tr key={key}>
                        <td>{key}</td>
                        <td>{value}</td>
                    </tr>
                })}
            </tbody>
        </table>

    </div>
}