"use client";

import { useState } from "react";

type ExpandableRowsGroupProps = {
    summary: string;
    rows: any[];
};

const ExpandableRowsGroup: React.FC<ExpandableRowsGroupProps> = ({ summary, rows }) => {

    const [isExpanded, setIsExpanded] = useState(false);

    console.log(rows)

    return (
        <>

            <tr onClick={() => setIsExpanded(!isExpanded)}>
                <td colSpan={100} className="border-b-2 border-t-2 border-l-2 border-r-2">
                    {summary} : <em>{rows.length} rows</em> <button onClick={() => setIsExpanded(!isExpanded)} className="btn" style={{ float: 'right' }}>
                        {isExpanded ? 'hide' : 'show'}</button> 
                </td>

            </tr>

            {isExpanded && rows
            }
            
        </>
    );
};


export default ExpandableRowsGroup;