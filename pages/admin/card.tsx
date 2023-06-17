import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import Card from '@/models/Card';
import ScreenTitle from '@/components/ScreenTitle';
import Panel from '@/components/Panel';
import Button from '@/components/Button';

export default function CardAdminPage ({}) {
    const {
        register,
        handleSubmit,
        reset,
        formState
    } = useForm({
        mode: 'onChange'
    });

    const {
        isDirty
    } = formState;

    const updatePost = async (content: any) => {
        const card = new Card(
            null,
            content.name,
            content.code,
            content.tier,
            content.collection,
            content.image,
            content.description,
            content.withQuestion,
            content.isActive
        );

        console.log('save', card);
        await card.save();

        reset();

        toast.success('Card updated successfully');
    };

    return (
        <main className="grid grid-rows-layout items-center min-h-screen p-4">
            <ScreenTitle>Card Admin Page</ScreenTitle>

            <Panel>
                <form onSubmit={handleSubmit(updatePost)}>
                    <div>
                        <input type="text" placeholder="name" {...register('name', { required: true })} />
                        <input type="text" placeholder="code" {...register(
                            'code',
                            {
                                required: true,
                                pattern: /^[A-Z0-9]{10}$/i
                            }
                        )} />
                        <select {...register('tier', { required: true })}>
                            <option value="common">common</option>
                            <option value="rare">rare</option>
                            <option value="legendary">legendary</option>
                        </select>
                        <select {...register('collection', { required: true })}>
                            <option value="mystic">mystic</option>
                            <option value="horror">horror</option>
                            <option value="young">young</option>
                            <option value="anime">anime</option>
                            <option value="sci-fi">sci-fi</option>
                            <option value="creature">creature</option>
                            <option value="view">view</option>
                        </select>
                        <input type="text" placeholder="image" {...register('image', { required: true })} />
                        <input type="text" placeholder="description" {...register(
                            'description',
                            { required: true }
                        )} />
                        <fieldset>
                            <input type="checkbox" placeholder="withQuestion" {...register('withQuestion', {})} />
                            <label>with question</label>
                        </fieldset>
                        <fieldset>
                            <input type="checkbox" placeholder="isActive" {...register('isActive', {})} />
                            <label>is active</label>
                        </fieldset>

                        {formState.errors.content && (
                            <p className="text-danger">{formState.errors.content.message as string}</p>)}

                        <Button type="submit" className="w-full">
                            {isDirty ? 'Save Changes' : 'No changes detected'}
                        </Button>
                    </div>
                </form>
            </Panel>
        </main>
    );
}