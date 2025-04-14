'use client';

import { Editor } from '@monaco-editor/react';
import debounce from 'lodash/debounce';
import { use, useCallback, useEffect, useState } from 'react';
import useSWR from 'swr';

import { getCode, updateCode } from '@/app/actions/code';

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

  const debouncedUpdateCode = useCallback(() => {
    return debounce(async (value: string) => {
      if (!code) return;
      await updateCode(uuid, code.fileName, value);
      mutate();
    }, 500);
  }, [code, uuid, mutate])();

  // Cleanup debounced function on unmount
  useEffect(() => {
    return () => {
      debouncedUpdateCode.cancel();
    };
  }, [debouncedUpdateCode]);

  const handleEditorChange = (value: string | undefined) => {
    if (!value) return;
    debouncedUpdateCode(value);
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
      <Editor
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
