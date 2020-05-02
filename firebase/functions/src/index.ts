import * as cors from 'cors';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import * as nodemailer from 'nodemailer';

admin.initializeApp();

let mailTransport: nodemailer.Transporter | null = null;
if ('email' in functions.config()) {
  mailTransport = nodemailer.createTransport(functions.config().email);
}

// tslint:disable-next-line:no-any (legacy code)
const delern: {[functionName: string]: any} = {
  createScheduledCardObject: () => {
    return {
      level: 'L0',
      // TODO(dotdoom): figure out better repeatAt
      repeatAt: 0,
    };
  },
  createMissingScheduledCards: async (uid: string, deckKey: string) => {
    const scheduledCards =
      (
        await admin
          .database()
          .ref('learning')
          .child(uid)
          .child(deckKey)
          .once('value')
      ).val() || {};
    const cards =
      (
        await admin.database().ref('cards').child(deckKey).once('value')
      ).val() || {};

    // tslint:disable-next-line:no-any (legacy code)
    const scheduledCardsUpdates: {[path: string]: any} = {};
    for (const cardKey in cards) {
      if (!(cardKey in scheduledCards)) {
        scheduledCardsUpdates[cardKey] = delern.createScheduledCardObject();
      }
    }

    if (Object.keys(scheduledCardsUpdates).length !== 0) {
      console.error(
        Error(
          `Database denormalized in deck ${deckKey} ` +
            `for user ${uid}, fixing (see below for details)`
        )
      );
      console.log(scheduledCardsUpdates);
      await admin
        .database()
        .ref('learning')
        .child(uid)
        .child(deckKey)
        .update(scheduledCardsUpdates);
    }
  },
  setScheduledCardForAllUsers: async (
    deckKey: string,
    cardKey: string,
    skipUid: string,
    // tslint:disable-next-line:no-any (legacy code)
    scheduledCard: any
  ) => {
    const deckAccesses = (
      await admin.database().ref('deck_access').child(deckKey).once('value')
    ).val();

    // tslint:disable-next-line:no-any (legacy code)
    const learningUpdate: {[key: string]: any} = {};
    for (const sharedWithUid in deckAccesses) {
      if (sharedWithUid !== skipUid) {
        learningUpdate[
          `${sharedWithUid}/${deckKey}/${cardKey}`
        ] = scheduledCard;
      }
    }
    await admin.database().ref('learning').update(learningUpdate);
  },
  forEachUser: null,

  /// Delete user data, but leave traces (like entries in deck_access and
  /// cards for the decks they had, in case they are shared). deck_access
  /// entry of this user will be deleted for deckKey. If the user was an owner
  /// of this deck, it is left ownerless. If the deck was not shared, the
  /// cards are left orphaned and must be cleaned up later.
  deleteUserLeavingTraces: (uid: string, deckKey: string) =>
    admin
      .database()
      .ref()
      .update({
        [`learning/${uid}`]: null,
        [`decks/${uid}`]: null,
        [`views/${uid}`]: null,
        [`deck_access/${deckKey}/${uid}`]: null,
      }),
};

export const userLookup = functions.https.onRequest((req, res) =>
  // https://firebase.google.com/docs/functions/http-events
  cors({origin: true})(req, res, async () => {
    // TODO(dotdoom): check auth, e.g.:
    // https://github.com/firebase/functions-samples/tree/master/authorized-https-endpoint

    if (!req.query.q) {
      res.status(400).end();
      return;
    }

    try {
      res.send((await admin.auth().getUserByEmail(req.query.q)).uid);
    } catch (error) {
      // TODO(dotdoom): getUserByPhoneNumber.
      res.status(404).end();
    }
  })
);

// Export a group of functions called "triggers". We put them all triggers into
// a single group to simplify their management, for example, disabling the
// entire group when a large database operation is running.
export const triggers = {
  deckShared: functions.database
    .ref('/deck_access/{deckKey}/{sharedWithUid}')
    .onCreate(async (data, context) => {
      if (!context.auth) {
        return;
      }
      if (data.val().access === 'owner') {
        console.log('Deck is being created (not shared), skipping');
        return;
      }

      const deckKey = context.params.deckKey;
      const sharedWithUser = await admin
        .auth()
        .getUser(context.params.sharedWithUid);

      // tslint:disable-next-line:no-any (legacy code)
      const scheduledCards: {[key: string]: any} = {};
      const cards = (
        await admin.database().ref('cards').child(deckKey).once('value')
      ).val();
      for (const cardKey of Object.keys(cards)) {
        scheduledCards[cardKey] = delern.createScheduledCardObject();
      }
      await admin
        .database()
        .ref('learning')
        .child(sharedWithUser.uid)
        .child(deckKey)
        .set(scheduledCards);

      if (context.authType !== 'USER') {
        // If the deck is shared by admin, we do not send notifications.
        return;
      }

      const numberOfCards = Object.keys(scheduledCards).length;
      const actorUser = await admin.auth().getUser(context.auth.uid);
      const deckName = (
        await admin
          .database()
          .ref('decks')
          .child(sharedWithUser.uid)
          .child(deckKey)
          .child('name')
          .once('value')
      ).val();
      if (mailTransport) {
        const mailOptions: nodemailer.SendMailOptions = {
          // Either "from" or "reply-to" will work with most servers and
          // clients.
          from: {
            name: actorUser.displayName + ' via Delern',
            address: actorUser.email!,
          },
          replyTo: actorUser.email,
          to: sharedWithUser.email,
          subject: actorUser.displayName + ' shared a Delern deck with you',
          text:
            `Hello! ${actorUser.displayName} has shared a Delern ` +
            `deck "${deckName}" (${numberOfCards} cards) with you! ` +
            'Go to the Delern app on your device to check it out',
        };
        console.log('Sending notification email', mailOptions);
        try {
          await mailTransport.sendMail(mailOptions);
        } catch (e) {
          console.error('Cannot send email', e);
        }
      }

      const fcmSnapshot = admin.database().ref('fcm').child(sharedWithUser.uid);
      const fcmEntries = (await fcmSnapshot.once('value')).val() || {};
      const payload = {
        notification: {
          title: actorUser.displayName + ' shared a deck with you',
          body:
            `${actorUser.displayName} shared their deck ` +
            `"${deckName}" (${numberOfCards} cards) with you`,
        },
        token: '',
      };

      const tokenRemovals: {[key: string]: null} = {};
      for (const fcmId of Object.keys(fcmEntries)) {
        console.log(
          `Notifying user ${sharedWithUser.uid} on ` +
            `${fcmEntries[fcmId].name} about user ${actorUser.uid} ` +
            `sharing a deck "${deckName}" (${numberOfCards} cards)`
        );
        payload.token = fcmId;
        try {
          console.log('Notified:', await admin.messaging().send(payload));
        } catch (e) {
          if (
            e.code === 'messaging/invalid-registration-token' ||
            e.code === 'messaging/registration-token-not-registered'
          ) {
            console.warn('Removing a token because of', e.code);
            tokenRemovals[sharedWithUser.uid + '/' + fcmId] = null;
          } else {
            console.error('FCM notification failed:', e.code, e);
          }
        }
      }
      await admin.database().ref('fcm').update(tokenRemovals);
    }),
  // TODO(dotdoom): Deck is removed by owner, and Learning/Views should be
  //                cleaned up by databaseMaintenance (2.4+).
  deckUnShared: functions.database
    .ref('/deck_access/{deckKey}/{uid}')
    .onDelete((data, context) => {
      const deckKey = context.params.deckKey;
      const uid = context.params.uid;

      return admin
        .database()
        .ref('/')
        .update({
          [`learning/${uid}/${deckKey}`]: null,
          [`views/${uid}/${deckKey}`]: null,
          [`decks/${uid}/${deckKey}`]: null,
        });
    }),
  cardAdded: functions.database
    .ref('/cards/{deckKey}/{cardKey}')
    .onCreate((data, context) => {
      if (!context.auth) {
        return null;
      }
      return delern.setScheduledCardForAllUsers(
        context.params.deckKey,
        // Don't update for the user creating this card - done by app.
        context.params.cardKey,
        context.auth.uid,
        delern.createScheduledCardObject()
      );
    }),
};

delern.forEachUser = async (
  batchSize: number,
  callback: (user: admin.auth.UserRecord) => Promise<void>,
  pageToken?: string
) => {
  const listUsersResult = await admin.auth().listUsers(batchSize, pageToken);

  await Promise.all(listUsersResult.users.map(callback));

  if (listUsersResult.pageToken) {
    await delern.forEachUser(batchSize, callback, listUsersResult.pageToken);
  }
};

export const databaseMaintenance = functions
  .runWith({timeoutSeconds: 300}) // Bump timeout from default 60s to 5min.
  .https.onRequest(async (req, res) => {
    const deckAccesses = (
      await admin.database().ref('deck_access').once('value')
    ).val();
    const decks = (await admin.database().ref('decks').once('value')).val();

    const uidCache: {[uid: string]: admin.auth.UserRecord} = {};
    // tslint:disable-next-line:no-any (legacy code)
    const updates: {[path: string]: any} = {};
    const missingCardsOperations: Array<Promise<void>> = [];

    let deletedSharedDecks = 0;

    for (const deckKey of Object.keys(deckAccesses)) {
      const deckAccess = deckAccesses[deckKey];

      for (const uid of Object.keys(deckAccess)) {
        if (!(uid in uidCache)) {
          try {
            uidCache[uid] = await admin.auth().getUser(uid);
          } catch (e) {
            console.error(
              `Cannot find user ${uid} for deck ` + `${deckKey}`,
              e
            );
            if (e.code === 'auth/user-not-found') {
              console.log(
                'User does not exist in ' +
                  'Authentication database, deleting their data'
              );
              await delern.deleteUserLeavingTraces(uid, deckKey);
            }
            continue;
          }
        }
        const user = uidCache[uid];
        updates[`deck_access/${deckKey}/${uid}/displayName`] =
          user.displayName || null;
        updates[`deck_access/${deckKey}/${uid}/photoUrl`] =
          user.photoURL || null;

        // TODO(dotdoom): this should be done by app.
        updates[`deck_access/${deckKey}/${uid}/email`] = user.email || null;

        if (uid in decks && deckKey in decks[uid]) {
          missingCardsOperations.push(
            delern.createMissingScheduledCards(uid, deckKey)
          );
        } else {
          deletedSharedDecks++;
        }
      }
    }

    console.log(
      `Found ${deletedSharedDecks} decks that were shared, but ` +
        'then deleted by the recipient from their list'
    );

    await Promise.all(missingCardsOperations);
    await admin.database().ref().update(updates);

    res.end();
  });
