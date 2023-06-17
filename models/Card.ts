import FirebaseModel from '@/models/FirebaseModel';
import { doc, DocumentSnapshot, getDoc, setDoc, SnapshotOptions, Timestamp } from '@firebase/firestore';
import { firestore } from '@/utils/firebase';
import { FireDoc } from '@/Enum/FireDoc';
import { CardTier, CardTierValue, getCardTierValue, isCardTier } from '@/Enum/CardTier';
import kebabCase from 'lodash.kebabcase';
import { RawCard } from '@/models/Raw';

export default class Card extends FirebaseModel {
    path = FireDoc.CARD;

    uid: string;
    name: string;
    code: string | null;
    value: CardTierValue;
    tier: CardTier;
    cardSet: string;
    image: string;
    description: string;
    withQuestion: boolean;
    isActive: boolean;
    collectedBy: string[];
    collectedAt: Date | null;

    constructor (
        uid: string | null = null,
        name: string = '',
        code: string | null = '',
        tier: CardTier = CardTier.COMMON,
        cardSet: string = '',
        image: string = '',
        description: string = '',
        withQuestion: boolean = false,
        isActive: boolean = false,
        collectedBy: string[] = [],
        collectedAt: Date | null = null
    ) {
        super();

        if (!isCardTier(tier)) {
            throw new Error(`Invalid value '${tier}' for card.tier`);
        }

        this.uid = uid ?? kebabCase(name);
        this.name = name;
        this.code = code;
        this.value = getCardTierValue(tier);
        this.tier = tier;
        this.cardSet = cardSet;
        this.image = image;
        this.description = description;
        this.withQuestion = withQuestion;
        this.isActive = isActive;
        this.collectedBy = collectedBy;
        this.collectedAt = collectedAt;
    }

    public static fromRaw (rawCard: RawCard): Card {
        if (rawCard.collectedAt['_seconds'] === undefined) {
            console.error('Inconsistent collectedAt date format');
        }

        return new Card(
            rawCard.uid,
            rawCard.name,
            rawCard.code,
            rawCard.tier,
            rawCard.cardSet,
            rawCard.image,
            rawCard.description,
            rawCard.withQuestion,
            rawCard.isActive,
            rawCard.collectedBy,
            Timestamp.fromMillis(rawCard.collectedAt._seconds * 1000)
                .toDate()
        );
    }

    public static async fromUid (uid: string): Promise<Card | undefined> {
        const cardDoc = doc(firestore, FireDoc.CARD, uid)
            .withConverter(this.getConverter());
        const snapshot = await getDoc(cardDoc);
        return snapshot.data() as Card | undefined;
    }

    public async save (): Promise<void> {
        console.log(this.uid);
        try {
            await setDoc(doc(firestore, FireDoc.CARD, this.uid)
                .withConverter(Card.getConverter()), this);
            console.log('Document written');
        } catch (e) {
            console.error('Error adding document: ', e);
        }

        return;
    }

    protected static toFirestore (data: Card): object {
        return {
            uid: data.uid,
            name: data.name,
            code: data.code,
            value: data.value,
            tier: data.tier,
            cardSet: data.cardSet,
            image: data.image,
            description: data.description,
            withQuestion: data.withQuestion,
            isActive: data.isActive,
            collectedBy: data.collectedBy,
            collectedAt: data.collectedAt
        };
    }

    protected static fromFirestore (
        snapshot: DocumentSnapshot,
        options: SnapshotOptions
    ): Card {
        const data = snapshot.data(options);

        if (data === undefined) {
            throw new Error('Data undefined');
        }

        return new Card(
            data.uid,
            data.name,
            data.code,
            data.tier,
            data.cardSet,
            data.image,
            data.description,
            data.withQuestion,
            data.isActive,
            data.collectedBy,
            data.collectedAt.toDate()
        );
    }
}

