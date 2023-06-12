import Panel from '../Panel';
import { useForm } from 'react-hook-form';
import { useEffect, useState } from 'react';
import { collectCardFunction } from '@/utils/functions';
import Button from '@/components/Button';
import Card from '@/models/Card';
import { RawCard } from '@/models/Raw';

export default function LookForCodeComponent ({
    code = null,
    onCodeValid,
    onCodeInvalid
}: { code?: string | null, onCodeValid: (card: Card) => void, onCodeInvalid: (error: Error) => void }) {
    const [loading, setLoading] = useState<boolean>(false);

    const {
        register,
        handleSubmit,
        reset,
        setValue,
        formState
    } = useForm({
        mode: 'onChange'
    });

    const { isValid } = formState;

    const collectCode = (data: any) => {
        setLoading(true);
        collectCardFunction({
            code: data.code
        })
            .then((result) => {
                setLoading(false);
                reset();

                onCodeValid(Card.fromRaw((result.data as any).card as RawCard));
            })
            .catch((error) => {
                setLoading(false);
                onCodeInvalid(error);
            });
    };

    useEffect(() => {
        if (code !== null) {
            setValue(
                'code',
                code,
                {
                    shouldValidate: true,
                    shouldDirty: true,
                    shouldTouch: true
                }
            );
        }
    }, [code, setValue]);

    return (
        <div>
            <Panel>
                <h2 className="text-2xl font-fancy pb-2">Zeskanuj kod</h2>
                <p>Użyj aparatu lub aplikacji do skanowania i dołącz do pogoni za skarbami!</p>
            </Panel>

            <Panel loading={loading}>
                <h2 className="text-2xl font-fancy pb-2">Wpisz kod ręcznie</h2>
                <p className="pb-2">Nie chcesz używać skanera skarbów? Wpisz kod tutaj.</p>

                <form onSubmit={handleSubmit(collectCode)}>
                    <input type="text" placeholder="ABCDEFGHIJ" maxLength={10}
                           className="rounded block w-full p-1 border-2 border-input-border text-center
                               bg-input-background text-text-light uppercase text-xl shadow-inner-input tracking-wider"
                           {...register(
                               'code',
                               {
                                   required: 'Wpisz kod',
                                   pattern: {
                                       value: /^[A-z0-9]{10}$/,
                                       message: 'Kod musi składać się z 10 znaków.'
                                   }
                               }
                           )} />

                    {formState.errors.code?.message && (
                        <p className="text-danger">{formState.errors.code?.message as string}</p>)}

                    <Button type="submit" disabled={!isValid} className="w-full mt-3">
                        Potwierdź
                    </Button>
                </form>
            </Panel>
        </div>
    );
}
