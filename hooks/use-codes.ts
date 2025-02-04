import useSWR from 'swr';

import {
  createCode,
  deleteCode,
  getCodes,
  updateCode,
} from '@/app/actions/code';
import { Code } from '@/types/code';

export function useCodes() {
  const { data: codes, mutate } = useSWR<Code[]>('code-files', getCodes);

  const handleCreateCode = async (fileName: string, code: string) => {
    const newCode = await createCode(fileName, code);
    await mutate();
    return newCode;
  };

  const handleUpdateCode = async (
    uuid: string,
    fileName: string,
    code: string
  ) => {
    const updatedCode = await updateCode(uuid, fileName, code);
    await mutate();
    return updatedCode;
  };

  const handleDeleteCode = async (uuid: string) => {
    const deletedCode = await deleteCode(uuid);
    await mutate();
    return deletedCode;
  };

  return {
    codes: codes ?? [],
    createCode: handleCreateCode,
    updateCode: handleUpdateCode,
    deleteCode: handleDeleteCode,
    isLoading: !codes,
  };
}
