'use client';

import debounce from 'lodash/debounce';
import { use, useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';

import { getCode, updateCode } from '@/app/actions/code';
import { LazyMonacoEditor } from '@/components/lazy-monaco-editor';

export default function CodeEditorDetailPage({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const { uuid } = use(params);
  const [language] = useState('python');

  const { data: code, mutate } = useSWR(`codes/${uuid}`, () =>
    getCode(uuid)
  );

  // Create stable debounced function using useMemo
  const debouncedUpdateCode = useMemo(
    () => debounce(async (value: string, fileName: string) => {
      await updateCode(uuid, fileName, value);
      mutate();
    }, 500),
    [uuid, mutate]
  );

  // Cleanup debounced function on unmount
  useEffect(() => {
    return () => {
      debouncedUpdateCode.cancel();
    };
  }, [debouncedUpdateCode]);

  const handleEditorChange = (value: string | undefined) => {
    if (!value || !code) return;
    debouncedUpdateCode(value, code.fileName);
  };

  if (!code) {
    return (
      <div className='h-screen w-full flex flex-1 items-center justify-center'>
        Loading...
      </div>
    );
  }

  return (
    <div className='h-screen w-full'>
      <LazyMonacoEditor
        height='100vh'
        defaultLanguage={language}
        defaultValue={code.code}
        theme='vs-light'
        onChange={handleEditorChange}
        options={{
          minimap: { enabled: true },
          fontSize: 14,
          lineNumbers: 'on',
          wordWrap: 'on',
          automaticLayout: true,
        }}
      />
    </div>
  );
}
