import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { Database, HardDrive, Server, RefreshCw } from 'lucide-react';

export default function StorageStats() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['storage-stats'],
    queryFn: async () => {
      const res = await (apiClient as any).api.superadmin['storage-stats'].$get();
      return res.json();
    }
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      await (apiClient as any).api.superadmin['storage-sync'].$post();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storage-stats'] });
    }
  });

  const handleSync = () => syncMutation.mutate();

  if (error) return <div className="text-red-400 p-4 border border-red-900 bg-red-950/30 rounded-xl max-w-4xl mx-auto mt-8">Error: {error.message}</div>;

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
      <div className="flex justify-between items-center bg-slate-800/50 p-6 rounded-2xl border border-slate-700">
        <div>
          <h2 className="text-2xl font-bold text-slate-100">Storage Statistics</h2>
          <p className="text-slate-400 mt-1">Monitor your database, backend, and frontend storage usage.</p>
        </div>
        <button 
          onClick={handleSync}
          disabled={syncMutation.isPending}
          className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:text-blue-300 text-white px-5 py-2.5 rounded-xl transition-all shadow-lg hover:shadow-blue-500/25"
        >
          <RefreshCw className={`w-5 h-5 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
          <span className="font-medium">{syncMutation.isPending ? 'Syncing...' : 'Sync Sizes'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 shadow-lg hover:-translate-y-1 transition-transform flex flex-col items-center text-center">
          <div className="p-4 bg-blue-500/20 text-blue-400 rounded-2xl mb-4">
            <Database className="w-10 h-10" />
          </div>
          <p className="text-slate-400 font-medium mb-1">Database Size</p>
          <h3 className="text-3xl font-bold text-slate-100">
            {isLoading ? '...' : `${data?.data?.dbSize || 0} MB`}
          </h3>
        </div>

        <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 shadow-lg hover:-translate-y-1 transition-transform flex flex-col items-center text-center">
          <div className="p-4 bg-purple-500/20 text-purple-400 rounded-2xl mb-4">
            <Server className="w-10 h-10" />
          </div>
          <p className="text-slate-400 font-medium mb-1">Backend Size</p>
          <h3 className="text-3xl font-bold text-slate-100">
            {isLoading ? '...' : `${data?.data?.backendSize || 0} MB`}
          </h3>
        </div>

        <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 shadow-lg hover:-translate-y-1 transition-transform flex flex-col items-center text-center">
          <div className="p-4 bg-green-500/20 text-green-400 rounded-2xl mb-4">
            <HardDrive className="w-10 h-10" />
          </div>
          <p className="text-slate-400 font-medium mb-1">Frontend Size</p>
          <h3 className="text-3xl font-bold text-slate-100">
            {isLoading ? '...' : '--'}
          </h3>
        </div>
      </div>
    </div>
    {/* Note: Overall Server RAM and CPU usage cards have been removed as they are now displayed in the Portal app. */}
  );
}
