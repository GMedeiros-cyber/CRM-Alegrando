import { Truck } from "lucide-react";

export default function TransportadoresPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="font-display text-3xl font-bold text-[#191918] dark:text-white tracking-tight">
                    Transportadores
                </h1>
                <p className="text-[#6366F1] dark:text-[#94a3b8] mt-1">
                    Diretório de empresas parceiras de transporte
                </p>
            </div>
            <div className="bento-card-static flex flex-col items-center justify-center py-24 gap-4">
                <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/15">
                    <Truck className="w-8 h-8 text-emerald-400" />
                </div>
                <div className="text-center">
                    <p className="font-display text-lg font-semibold text-[#191918] dark:text-white">
                        Transportadores em construção
                    </p>
                    <p className="text-sm text-[#6366F1] dark:text-[#94a3b8] mt-1 max-w-sm">
                        O diretório de transportadores com CRUD completo será implementado na próxima fase.
                    </p>
                </div>
            </div>
        </div>
    );
}
