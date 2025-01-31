import { use } from 'react';

export default function CodeEditorDetailPage({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const { uuid } = use(params);
  return (
    <div>
      <h1>Code Editor Detail Page {uuid}</h1>
    </div>
  );
}
