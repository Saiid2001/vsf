import {dbQueries} from '../db';

// export default function DatabaseSelector() {
  
// }


export default async function TaskList() {

  const tasks = await dbQueries.getTasks();
  const candidateCounts = await dbQueries.getCandidateCounts();
  const candidateCountsMap = candidateCounts.reduce((acc: any, { task_id, count }: any) => {
    acc[task_id] = count;
    return acc;
  }
  , {});

  const statusCodeCounts = await dbQueries.getStatusCodeCounts();

  return (
    <div>

      <h1>Stats</h1>
      <table className='w-fit'>
        <thead>
          <tr>
        <th className='px-2'>Status Code</th>
        <th className='px-2'>Count</th>
          </tr>
        </thead>
        <tbody>
        {statusCodeCounts.map((row: any) => (
          <tr key={row.status_code}>
        <td className='px-2'>{row.status_code}</td>
        <td className='px-2'>{row.count}</td>
          </tr>
        ))}
        </tbody>
      </table>

      
      <h1>Tasks</h1>
      <table className='w-fit'>
        <thead>
          <tr>
            <th className='px-2'>Task ID</th>
            <th className='px-2'>Subject ID</th>
            <th className='px-2'>Subject Site</th>
            <th className='px-2'>Account ID</th>
            <th className='px-2'>Identity</th>
            <th className='px-2'>Visited On</th>
            <th className='px-2'>Nb. Candidates</th>
            <th className='px-2'>Actions</th>
          </tr>
        </thead>
        <tbody>
        {tasks.map((task: any) => (
          <tr key={task.id} className={'border-b' + (!candidateCountsMap[task.id] ? ' bg-red-400/20 text-red' : '')}>
            <td className='px-2 text-right py-4'>{task.id}</td>
            <td className='px-2 py-4 text-right'>{task.subject_id}</td>
            <td className='px-2 py-4'>{task.start_url}</td>
            <td className='px-2 py-4'>{task.session_information.account.id}</td>
            <td className='px-2 py-4'>{task.session_information.account.credentials.identity.id} {task.session_information.account.credentials.identity.username}</td>
            <td className='px-2 py-4'>{task.visitation_end.toLocaleString('en-US')}</td>
            <td className='px-2 py-4 text-right'>{candidateCountsMap[task.id] || 0}</td>
            <td className='px-2 py-4'>
              {candidateCountsMap[task.id] &&
              <a href={`/tasks/${task.id}/candidates`} className='bg-green-400/25 p-2 rounded m-2'>View candidates</a>
              }
            </td>
          </tr>
        ))}
        </tbody>
      </table> 
    

    </div>
  );
}
